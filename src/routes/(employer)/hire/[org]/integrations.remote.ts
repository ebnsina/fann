import * as v from 'valibot';
import { command, query } from '$app/server';
import { requirePermission } from '#lib/server/auth/guards';
import * as apiKey from '#lib/server/services/api-key';
import * as webhook from '#lib/server/services/webhook';

/**
 * API keys and webhooks.
 *
 * All of it behind `org.update`, which is owners and admins. A key can post jobs
 * and read every application this company has received, so issuing one is the
 * same authority as changing the company itself — not something a recruiter seat
 * should carry.
 */
const uuid = v.pipe(v.string(), v.uuid());

export const integrations = query(v.string(), async (orgSlug) => {
	const { organizationId } = await requirePermission(orgSlug, 'org.update');

	const [keys, endpoints, deliveries] = await Promise.all([
		apiKey.listFor(organizationId),
		webhook.listFor(organizationId),
		webhook.recentDeliveries(organizationId)
	]);

	return { keys, endpoints, deliveries, events: webhook.WEBHOOK_EVENTS };
});

/**
 * Issue a key.
 *
 * The plaintext comes back **once**, in this response, and is never recoverable —
 * only its hash is stored. The page has to show it immediately and say so.
 */
export const createApiKey = command(
	v.object({ orgSlug: v.string(), name: v.pipe(v.string(), v.trim(), v.nonEmpty()) }),
	async ({ orgSlug, name }) => {
		const { organizationId, user } = await requirePermission(orgSlug, 'org.update');

		const issued = await apiKey.issue(organizationId, name, user.id);
		await integrations(orgSlug).refresh();

		return issued;
	}
);

export const revokeApiKey = command(
	v.object({ orgSlug: v.string(), keyId: uuid }),
	async ({ orgSlug, keyId }) => {
		const { organizationId } = await requirePermission(orgSlug, 'org.update');

		await apiKey.revoke(organizationId, keyId);
		await integrations(orgSlug).refresh();

		return { revoked: true };
	}
);

export const addWebhook = command(
	v.object({
		orgSlug: v.string(),
		url: v.pipe(v.string(), v.trim(), v.nonEmpty()),
		events: v.array(v.picklist(webhook.WEBHOOK_EVENTS))
	}),
	async ({ orgSlug, url, events }) => {
		const { organizationId } = await requirePermission(orgSlug, 'org.update');

		const created = await webhook.addEndpoint(organizationId, url, events);
		await integrations(orgSlug).refresh();

		return created;
	}
);

export const removeWebhook = command(
	v.object({ orgSlug: v.string(), endpointId: uuid }),
	async ({ orgSlug, endpointId }) => {
		const { organizationId } = await requirePermission(orgSlug, 'org.update');

		await webhook.removeEndpoint(organizationId, endpointId);
		await integrations(orgSlug).refresh();

		return { removed: true };
	}
);
