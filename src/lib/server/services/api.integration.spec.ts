import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { apiKeys, webhookDeliveries } from '../db/schema/api';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import { issue, listFor, resolve, revoke } from './api-key';
import { addEndpoint, enqueue, listFor as listHooks, sign, verify } from './webhook';

const SUITE = 'api';

describe.skipIf(!databaseReachable)('API keys', () => {
	let fixture: JobFixture;
	let userId: string;

	beforeAll(async () => {
		fixture = await createJobFixture(SUITE);
		userId = (await createUser(SUITE)).id;
	});

	afterAll(async () => {
		await fixture.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	it('never stores the key it hands out', async () => {
		const issued = await issue(fixture.organizationId, 'Careers page', userId);

		const [stored] = await db.select().from(apiKeys).where(eq(apiKeys.id, issued.id));

		// The whole premise. A key this table could reveal is one a database backup
		// hands to whoever reads it.
		expect(stored.tokenHash).not.toBe(issued.token);
		expect(JSON.stringify(stored)).not.toContain(issued.token);
		// The prefix is enough to recognise a key in a list, far short of using one.
		expect(issued.token.startsWith(stored.prefix)).toBe(true);
		expect(stored.prefix.length).toBeLessThan(issued.token.length);
	});

	it('resolves a live key to its organization and nothing else', async () => {
		const issued = await issue(fixture.organizationId, 'Integration', userId);

		const resolved = await resolve(issued.token);

		expect(resolved?.organizationId).toBe(fixture.organizationId);
		// Carried so a write can name an author — a job posted through the API is
		// still something a person is answerable for.
		expect(resolved?.createdByUserId).toBe(userId);
	});

	it('refuses anything that is not a live key', async () => {
		const issued = await issue(fixture.organizationId, 'Doomed', userId);

		expect(await resolve(null)).toBeNull();
		expect(await resolve('')).toBeNull();
		expect(await resolve('not-a-key')).toBeNull();
		// Right prefix, wrong secret — the shape somebody guessing would send.
		expect(await resolve('fann_sk_' + 'a'.repeat(43))).toBeNull();
		expect(await resolve(`${issued.token}x`)).toBeNull();

		await revoke(fixture.organizationId, issued.id);
		expect(await resolve(issued.token)).toBeNull();
	});

	it('revokes rather than deletes, so the record survives', async () => {
		const issued = await issue(fixture.organizationId, 'Old key', userId);
		await revoke(fixture.organizationId, issued.id);

		const keys = await listFor(fixture.organizationId);
		const row = keys.find((key) => key.id === issued.id);

		// "This key was live between these dates and then somebody turned it off" is
		// the question asked after an incident.
		expect(row).toBeDefined();
		expect(row?.revokedAt).not.toBeNull();
	});

	it('cannot revoke a key belonging to another organization', async () => {
		const other = await createJobFixture(`${SUITE}-other`);
		try {
			const issued = await issue(fixture.organizationId, 'Mine', userId);

			await revoke(other.organizationId, issued.id);

			expect(await resolve(issued.token)).not.toBeNull();
		} finally {
			await other.cleanup();
		}
	});
});

describe.skipIf(!databaseReachable)('webhooks', () => {
	let fixture: JobFixture;

	beforeAll(async () => {
		fixture = await createJobFixture(`${SUITE}-hooks`);
	});

	afterAll(async () => {
		await fixture.cleanup();
	});

	it('refuses anything that is not a public https URL', async () => {
		// A webhook is the product making a request to a URL somebody typed. Without
		// this it is a way to probe our own network from the outside.
		for (const url of [
			'http://example.com/hook',
			'https://localhost/hook',
			'https://127.0.0.1/hook',
			'https://10.0.0.5/hook',
			'https://192.168.1.10/hook',
			'https://172.16.4.4/hook',
			'https://169.254.169.254/latest/meta-data',
			'https://db.internal/hook',
			'not a url'
		]) {
			await expect(
				addEndpoint(fixture.organizationId, url, ['application.created'])
			).rejects.toThrow();
		}

		expect(await listHooks(fixture.organizationId)).toHaveLength(0);
	});

	it('accepts a public https URL and generates its own secret', async () => {
		const created = await addEndpoint(fixture.organizationId, 'https://example.com/fann', [
			'application.created'
		]);

		// Generated, never chosen: a secret somebody picks is one they reuse.
		expect(created.secret).toMatch(/^whsec_/);
		expect(created.secret.length).toBeGreaterThan(30);
	});

	it('queues only for endpoints subscribed to that event', async () => {
		await addEndpoint(fixture.organizationId, 'https://example.com/created-only', [
			'application.created'
		]);

		await db.delete(webhookDeliveries);

		const queued = await enqueue(fixture.organizationId, 'application.status_changed', {
			applicationId: 'x'
		});

		// The endpoints above only asked for `application.created`.
		expect(queued).toBe(0);
		expect(await db.select().from(webhookDeliveries)).toHaveLength(0);

		const created = await enqueue(fixture.organizationId, 'application.created', {
			applicationId: 'x'
		});
		expect(created).toBeGreaterThan(0);
	});

	it('signs over the timestamp as well as the body', () => {
		const body = JSON.stringify({ event: 'application.created', data: {} });
		const signature = sign('whsec_test', 1_700_000_000, body);

		expect(verify('whsec_test', 1_700_000_000, body, signature)).toBe(true);

		// Signing the body alone would make every past delivery valid forever, so a
		// captured one must not verify against a different timestamp.
		expect(verify('whsec_test', 1_700_000_001, body, signature)).toBe(false);
		expect(verify('whsec_other', 1_700_000_000, body, signature)).toBe(false);
		expect(verify('whsec_test', 1_700_000_000, `${body} `, signature)).toBe(false);
		expect(verify('whsec_test', 1_700_000_000, body, 'deadbeef')).toBe(false);
	});
});
