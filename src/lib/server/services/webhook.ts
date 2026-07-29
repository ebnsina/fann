import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { webhookDeliveries, webhookEndpoints } from '../db/schema/api';

/**
 * Outgoing webhooks.
 *
 * Every attempt is recorded, sent or failed — the same argument as `email_log`.
 * A webhook that silently stopped firing is indistinguishable from one nobody is
 * subscribed to, and "did you actually send it" is the first thing in dispute
 * when somebody's integration goes wrong.
 *
 * Queuing and sending are **separate**. `enqueue` only writes a row, so it can be
 * called from inside a service without a stranger's slow HTTP endpoint sitting in
 * the middle of an employer's transaction. `dispatchPending` does the sending and
 * is driven by the scheduled route, like the other background work here.
 */

export type WebhookEvent = 'application.created' | 'application.status_changed';

export const WEBHOOK_EVENTS: WebhookEvent[] = ['application.created', 'application.status_changed'];

/** Give up after this many attempts. */
const MAX_ATTEMPTS = 5;

/** How long we wait for somebody else's server before calling it a failure. */
const TIMEOUT_MS = 10_000;

/** 1m, 5m, 25m, 2h — enough to ride out a deploy without retrying for a week. */
function backoffMs(attempt: number): number {
	return Math.min(60_000 * 5 ** (attempt - 1), 4 * 60 * 60_000);
}

export interface EndpointRow {
	id: string;
	url: string;
	events: string[];
	createdAt: Date;
	disabledAt: Date | null;
}

export async function listFor(organizationId: string): Promise<EndpointRow[]> {
	return db
		.select({
			id: webhookEndpoints.id,
			url: webhookEndpoints.url,
			events: webhookEndpoints.events,
			createdAt: webhookEndpoints.createdAt,
			disabledAt: webhookEndpoints.disabledAt
		})
		.from(webhookEndpoints)
		.where(eq(webhookEndpoints.organizationId, organizationId))
		.orderBy(desc(webhookEndpoints.createdAt));
}

/**
 * Add an endpoint.
 *
 * **HTTPS only, and never a private address.** A webhook is the product making a
 * request to a URL somebody typed, which is the definition of server-side request
 * forgery if it is not constrained — `http://localhost:5432` or `169.254.169.254`
 * would turn this form into a way to probe our own network from the outside.
 */
export async function addEndpoint(
	organizationId: string,
	url: string,
	events: WebhookEvent[]
): Promise<{ id: string; secret: string }> {
	let parsed: URL;
	try {
		parsed = new URL(url.trim());
	} catch {
		error(400, 'That does not look like a URL.');
	}

	if (parsed.protocol !== 'https:') {
		error(400, 'The URL must start with https. We will not send your data unencrypted.');
	}

	if (isPrivateHost(parsed.hostname)) {
		error(400, 'That address is not reachable from the internet.');
	}

	if (events.length === 0) error(400, 'Choose at least one event to send.');

	// Generated, never chosen: a secret somebody picks is one they will reuse.
	const secret = `whsec_${randomBytes(32).toString('base64url')}`;

	const [row] = await db
		.insert(webhookEndpoints)
		.values({ organizationId, url: parsed.toString(), secret, events })
		.returning({ id: webhookEndpoints.id });

	return { id: row.id, secret };
}

/**
 * Addresses that are not somebody's public server.
 *
 * Deliberately a denylist of shapes rather than a DNS lookup: resolving here and
 * connecting later is a race an attacker controls (the name can resolve
 * differently the second time). This blocks the obvious cases at the door; a
 * deployment that needs stronger guarantees should egress through a proxy that
 * cannot reach the private network at all.
 */
function isPrivateHost(hostname: string): boolean {
	const host = hostname.toLowerCase();

	if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
		return true;
	}

	// IPv6 loopback and unique-local.
	if (host === '::1' || host.startsWith('fd') || host.startsWith('fe80')) return true;

	const parts = host.split('.');
	if (parts.length === 4 && parts.every((part) => /^\d+$/.test(part))) {
		const [a, b] = parts.map(Number);
		if (a === 127 || a === 10 || a === 0) return true;
		if (a === 192 && b === 168) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		// The cloud metadata endpoint, which is the one everybody actually goes for.
		if (a === 169 && b === 254) return true;
	}

	return false;
}

export async function removeEndpoint(organizationId: string, endpointId: string): Promise<void> {
	await db
		.delete(webhookEndpoints)
		.where(
			and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.organizationId, organizationId))
		);
}

/**
 * Queue a delivery for every endpoint subscribed to this event.
 *
 * Writes rows and returns. Never sends, never throws: a service calling this has
 * already committed the thing being announced, and a stranger's endpoint being
 * down must not roll back an employer's decision or make them wait for it.
 */
export async function enqueue(
	organizationId: string,
	event: WebhookEvent,
	payload: Record<string, unknown>
): Promise<number> {
	try {
		const endpoints = await db
			.select({ id: webhookEndpoints.id, events: webhookEndpoints.events })
			.from(webhookEndpoints)
			.where(
				and(
					eq(webhookEndpoints.organizationId, organizationId),
					isNull(webhookEndpoints.disabledAt)
				)
			);

		const subscribed = endpoints.filter((endpoint) => endpoint.events.includes(event));
		if (subscribed.length === 0) return 0;

		await db.insert(webhookDeliveries).values(
			subscribed.map((endpoint) => ({
				endpointId: endpoint.id,
				event,
				payload,
				nextAttemptAt: new Date()
			}))
		);

		return subscribed.length;
	} catch (cause) {
		console.error('Could not queue a webhook', { event, cause });
		return 0;
	}
}

/**
 * The signature a receiver checks.
 *
 * Timestamped and signed over `timestamp.body`, so a captured delivery cannot be
 * replayed later against a receiver that checks the age — signing the body alone
 * would make every past delivery valid forever.
 */
export function sign(secret: string, timestamp: number, body: string): string {
	return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** For receivers written against this codebase, and for the tests. */
export function verify(
	secret: string,
	timestamp: number,
	body: string,
	signature: string
): boolean {
	const expected = Buffer.from(sign(secret, timestamp, body));
	const provided = Buffer.from(signature);

	if (expected.byteLength !== provided.byteLength) return false;
	return timingSafeEqual(expected, provided);
}

/**
 * Send whatever is due.
 *
 * Driven by the scheduled route rather than a timer in the app, so it runs once
 * per deployment rather than once per process. Each delivery is independent —
 * one endpoint being down must not stop the others, which is why every attempt
 * is wrapped rather than the loop.
 */
export async function dispatchPending(limit = 50): Promise<{ sent: number; failed: number }> {
	const due = await db
		.select({
			id: webhookDeliveries.id,
			event: webhookDeliveries.event,
			payload: webhookDeliveries.payload,
			attempts: webhookDeliveries.attempts,
			url: webhookEndpoints.url,
			secret: webhookEndpoints.secret
		})
		.from(webhookDeliveries)
		.innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
		.where(
			and(
				eq(webhookDeliveries.status, 'pending'),
				or(
					isNull(webhookDeliveries.nextAttemptAt),
					lte(webhookDeliveries.nextAttemptAt, sql`now()`)
				)
			)
		)
		.orderBy(asc(webhookDeliveries.createdAt))
		.limit(limit);

	let sent = 0;
	let failed = 0;

	for (const delivery of due) {
		const attempt = delivery.attempts + 1;
		const body = JSON.stringify({ event: delivery.event, data: delivery.payload });
		const timestamp = Math.floor(Date.now() / 1000);

		try {
			const response = await fetch(delivery.url, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'fann-event': delivery.event,
					'fann-timestamp': String(timestamp),
					'fann-signature': sign(delivery.secret, timestamp, body)
				},
				body,
				signal: AbortSignal.timeout(TIMEOUT_MS)
			});

			if (response.ok) {
				await db
					.update(webhookDeliveries)
					.set({
						status: 'delivered',
						attempts: attempt,
						responseStatus: response.status,
						nextAttemptAt: null,
						error: null
					})
					.where(eq(webhookDeliveries.id, delivery.id));

				sent++;
				continue;
			}

			await recordFailure(delivery.id, attempt, response.status, `HTTP ${response.status}`);
			failed++;
		} catch (cause) {
			await recordFailure(
				delivery.id,
				attempt,
				null,
				cause instanceof Error ? cause.message : String(cause)
			);
			failed++;
		}
	}

	return { sent, failed };
}

async function recordFailure(
	id: string,
	attempt: number,
	responseStatus: number | null,
	message: string
): Promise<void> {
	// Given up on, rather than retried forever. A dead endpoint retried
	// indefinitely is a queue that never drains and a server somebody else is
	// still being hammered by.
	const exhausted = attempt >= MAX_ATTEMPTS;

	await db
		.update(webhookDeliveries)
		.set({
			status: exhausted ? 'failed' : 'pending',
			attempts: attempt,
			responseStatus,
			error: message.slice(0, 1000),
			nextAttemptAt: exhausted ? null : new Date(Date.now() + backoffMs(attempt))
		})
		.where(eq(webhookDeliveries.id, id));
}

/** Recent attempts for one organization, so a failure is visible in the product. */
export async function recentDeliveries(organizationId: string, limit = 25) {
	return db
		.select({
			id: webhookDeliveries.id,
			event: webhookDeliveries.event,
			status: webhookDeliveries.status,
			attempts: webhookDeliveries.attempts,
			responseStatus: webhookDeliveries.responseStatus,
			error: webhookDeliveries.error,
			createdAt: webhookDeliveries.createdAt,
			url: webhookEndpoints.url
		})
		.from(webhookDeliveries)
		.innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
		.where(eq(webhookEndpoints.organizationId, organizationId))
		.orderBy(desc(webhookDeliveries.createdAt))
		.limit(limit);
}
