import {
	boolean,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { baseColumns, primaryKeyColumn, timestampColumns } from './_shared';

/**
 * Users are role-agnostic. The same account can apply for jobs and belong to a
 * hiring organization — employer capability comes from `org_members`, never from a
 * flag here. Modelling "candidate" and "employer" as separate account types is the
 * mistake that forces people to keep two logins.
 */
export const users = pgTable(
	'users',
	{
		...baseColumns,
		/** Stored lowercase and trimmed; uniqueness is enforced on that normalized form. */
		email: text('email').notNull(),
		emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'date' }),
		/** Null for accounts that only ever signed in through OAuth. */
		passwordHash: text('password_hash'),
		name: text('name').notNull(),
		avatarFileId: uuid('avatar_file_id'),
		/**
		 * Platform staff, who can act on reports anywhere.
		 *
		 * Deliberately a column with no way to set it from the product. Somebody who
		 * can moderate every company's threads is not a role a signup flow should be
		 * able to grant, and an admin screen for promoting admins is the first thing
		 * an attacker looks for. Set it by hand, in the database, on purpose.
		 */
		platformAdmin: boolean('platform_admin').notNull().default(false),
		/** Set when the user asks for deletion; purged by a retention job. */
		deactivatedAt: timestamp('deactivated_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [uniqueIndex('users_email_key').on(table.email)]
);

/**
 * Sessions store only the SHA-256 of the token, so a database leak does not hand
 * over live sessions. The plaintext token exists solely in the user's cookie.
 */
export const sessions = pgTable(
	'sessions',
	{
		...primaryKeyColumn,
		...timestampColumns,
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
		/** Shown in "active sessions" so a user can recognise and revoke a device. */
		ipAddress: text('ip_address'),
		userAgent: text('user_agent')
	},
	(table) => [
		uniqueIndex('sessions_token_hash_key').on(table.tokenHash),
		index('sessions_user_id_idx').on(table.userId),
		// Lets the cleanup job find expired rows without a sequential scan.
		index('sessions_expires_at_idx').on(table.expiresAt)
	]
);

export const oauthProviderEnum = pgEnum('oauth_provider', ['google', 'github', 'linkedin']);

export const oauthAccounts = pgTable(
	'oauth_accounts',
	{
		...baseColumns,
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		provider: oauthProviderEnum('provider').notNull(),
		/** The provider's stable user id — not the email, which can change. */
		providerAccountId: text('provider_account_id').notNull()
	},
	(table) => [
		uniqueIndex('oauth_accounts_provider_account_key').on(table.provider, table.providerAccountId),
		index('oauth_accounts_user_id_idx').on(table.userId)
	]
);

export const emailTokenPurposeEnum = pgEnum('email_token_purpose', [
	'email_verification',
	'password_reset'
]);

/**
 * Single-use, short-lived tokens delivered by email. Hashed like sessions, for the
 * same reason: a leaked table must not be a password-reset oracle.
 */
export const emailTokens = pgTable(
	'email_tokens',
	{
		...primaryKeyColumn,
		...timestampColumns,
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		purpose: emailTokenPurposeEnum('purpose').notNull(),
		tokenHash: text('token_hash').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
		consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		uniqueIndex('email_tokens_token_hash_key').on(table.tokenHash),
		index('email_tokens_user_purpose_idx').on(table.userId, table.purpose)
	]
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
