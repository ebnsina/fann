import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { baseColumns, primaryKeyColumn } from './_shared';
import { users } from './identity';
import { organizations } from './org';

/**
 * API keys.
 *
 * Only the SHA-256 lands here, exactly like `org_invites` and `sessions`. The
 * plaintext is shown once, at creation, and is unrecoverable afterwards — a key
 * this table could reveal is one a database backup hands to whoever reads it.
 *
 * A key is **scoped to one organization** and carries no user. It authenticates a
 * system, not a person, and tying it to somebody's account would mean it quietly
 * stopped working the day they left — or worse, kept their access after.
 */
export const apiKeys = pgTable(
	'api_keys',
	{
		...baseColumns,
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		/** What it is for, so somebody can tell which one to revoke. */
		name: text('name').notNull(),
		/** SHA-256 of the key. The key itself is never stored. */
		tokenHash: text('token_hash').notNull().unique(),
		/** First characters, shown in the list so a key can be recognised. */
		prefix: text('prefix').notNull(),
		createdByUserId: uuid('created_by_user_id').references(() => users.id, {
			onDelete: 'set null'
		}),
		/** Answers "is this still in use" before somebody revokes it. */
		lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
		/** Revoked rather than deleted, so the audit trail survives. */
		revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [index('api_keys_org_idx').on(table.organizationId)]
);

/** What a webhook can be told about. Each one maps to a real service event. */
export const webhookEventEnum = pgEnum('webhook_event', [
	'application.created',
	'application.status_changed'
]);

export const webhookEndpoints = pgTable(
	'webhook_endpoints',
	{
		...baseColumns,
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		url: text('url').notNull(),
		/**
		 * Signs every delivery, so the receiver can tell our POST from anyone else's.
		 *
		 * Stored in the clear, unlike an API key, and necessarily: signing requires
		 * the secret itself on both sides. It is shown once in the interface for the
		 * same reason it is generated rather than chosen.
		 */
		secret: text('secret').notNull(),
		events: jsonb('events').$type<string[]>().notNull(),
		disabledAt: timestamp('disabled_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [index('webhook_endpoints_org_idx').on(table.organizationId)]
);

export const webhookDeliveryStatusEnum = pgEnum('webhook_delivery_status', [
	'pending',
	'delivered',
	'failed'
]);

/**
 * Every attempt, kept.
 *
 * The same argument as `email_log`: a webhook that silently stopped firing is
 * indistinguishable from one nobody is subscribed to, and "we sent it" is the
 * first thing in dispute when an integration goes wrong.
 */
export const webhookDeliveries = pgTable(
	'webhook_deliveries',
	{
		...primaryKeyColumn,
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		endpointId: uuid('endpoint_id')
			.notNull()
			.references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
		event: text('event').notNull(),
		payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
		status: webhookDeliveryStatusEnum('status').notNull().default('pending'),
		attempts: integer('attempts').notNull().default(0),
		responseStatus: integer('response_status'),
		error: text('error'),
		/** When the next retry may run. Null once it is settled. */
		nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		index('webhook_deliveries_endpoint_idx').on(table.endpointId, table.createdAt),
		// Finds the retry queue without scanning every delivery ever made.
		index('webhook_deliveries_pending_idx').on(table.status, table.nextAttemptAt)
	]
);
