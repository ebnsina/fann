import {
	bigint,
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid
} from 'drizzle-orm/pg-core';
import { baseColumns, primaryKeyColumn, timestampColumns } from './_shared';
import { users } from './identity';

/** Which storage driver holds the bytes. Determines how `key` is resolved. */
export const storageDriverEnum = pgEnum('storage_driver', ['local', 's3']);

/**
 * Uploads are scanned asynchronously. Nothing may be served to a user other than
 * the uploader until the status is `clean` — resumes are the single most
 * attractive malware vector in a hiring product.
 */
export const fileScanStatusEnum = pgEnum('file_scan_status', [
	'pending',
	'clean',
	'infected',
	'failed'
]);

export const files = pgTable(
	'files',
	{
		...baseColumns,
		/** Driver-relative path. Never user-controlled and never guessable. */
		key: text('key').notNull().unique(),
		driver: storageDriverEnum('driver').notNull(),
		/** Name the user uploaded it under — display only, never used as a path. */
		originalName: text('original_name').notNull(),
		mimeType: text('mime_type').notNull(),
		sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
		/** SHA-256 of the contents, for dedupe and integrity checks. */
		checksum: text('checksum').notNull(),
		scanStatus: fileScanStatusEnum('scan_status').notNull().default('pending'),
		uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, {
			// Keep the file when the uploader is deleted — an application's resume must
			// outlive the account so the employer's record stays intact.
			onDelete: 'set null'
		})
	},
	(table) => [
		index('files_checksum_idx').on(table.checksum),
		index('files_uploaded_by_idx').on(table.uploadedByUserId)
	]
);

/**
 * Append-only record of consequential actions. Written by the services layer,
 * never updated or deleted. Backs the admin audit viewer and any
 * "who changed this candidate's stage" question.
 */
export const auditLog = pgTable(
	'audit_log',
	{
		...primaryKeyColumn,
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		/** Null for system-initiated actions (cron, webhook). */
		actorUserId: uuid('actor_user_id'),
		organizationId: uuid('organization_id'),
		/** Dotted action name, e.g. `application.stage_changed`. */
		action: text('action').notNull(),
		entityType: text('entity_type').notNull(),
		entityId: uuid('entity_id'),
		/** Changed fields only — never the whole row, and never secrets. */
		changes: jsonb('changes').$type<Record<string, { from: unknown; to: unknown }>>(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent')
	},
	(table) => [
		index('audit_log_entity_idx').on(table.entityType, table.entityId),
		index('audit_log_actor_idx').on(table.actorUserId, table.createdAt),
		index('audit_log_org_idx').on(table.organizationId, table.createdAt)
	]
);

/**
 * Fixed-window rate limiting, in Postgres rather than Redis.
 *
 * One fewer service to run, and login/signup/reset volumes are nowhere near the
 * rate where the write cost matters. Revisit if a hot endpoint ever needs it.
 */
export const rateLimits = pgTable(
	'rate_limits',
	{
		/** `<action>:<subject>`, e.g. `login:ip:203.0.113.4` or `login:email:a@b.c`. */
		key: text('key').primaryKey(),
		count: integer('count').notNull().default(0),
		/** When the current window began; a new window resets the count. */
		windowStartedAt: timestamp('window_started_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [index('rate_limits_window_idx').on(table.windowStartedAt)]
);

export const emailStatusEnum = pgEnum('email_status', ['sent', 'failed']);

/**
 * Record of every transactional email the product tried to send.
 *
 * Exists so "we notified the candidate" is a checkable claim rather than a
 * hopeful one. Without it, a silently failing mail provider looks exactly like a
 * working one from inside the app — which, for a product whose whole position is
 * that people get told where they stand, is the worst possible blind spot.
 */
export const emailLog = pgTable(
	'email_log',
	{
		...primaryKeyColumn,
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		/** Null when the recipient has no account (e.g. an org invite). */
		userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
		toEmail: text('to_email').notNull(),
		/** Matches `EmailMessage.tag`, e.g. `application.rejected`. */
		tag: text('tag').notNull(),
		subject: text('subject').notNull(),
		status: emailStatusEnum('status').notNull(),
		/** Provider id when one was returned, for tracing a specific message. */
		providerMessageId: text('provider_message_id'),
		error: text('error'),
		/** What this was about, so a failure can be retried or explained. */
		entityType: text('entity_type'),
		entityId: uuid('entity_id')
	},
	(table) => [
		index('email_log_user_idx').on(table.userId, table.createdAt),
		index('email_log_tag_idx').on(table.tag, table.createdAt),
		// Finds failures to retry without scanning the whole table.
		index('email_log_status_idx').on(table.status, table.createdAt)
	]
);

/** Runtime kill switches and staged rollouts. Read through a cached service. */
export const featureFlags = pgTable('feature_flags', {
	...timestampColumns,
	key: text('key').primaryKey(),
	description: text('description').notNull().default(''),
	enabled: boolean('enabled').notNull().default(false),
	/** 0–100. Applied by hashing a stable subject id, not at random per request. */
	rolloutPercentage: integer('rollout_percentage').notNull().default(0),
	/** Org or user ids that always receive the flag regardless of rollout. */
	allowList: jsonb('allow_list').$type<string[]>().notNull().default([])
});
