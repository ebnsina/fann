import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { baseColumns, baseSoftDeleteColumns, primaryKeyColumn, timestampColumns } from './_shared';
import { users } from './identity';

/**
 * Roles are ordered from most to least privileged. The order is meaningful —
 * `permissions.ts` compares rank, so inserting a role in the middle changes what
 * existing members can do. Append, or update the permission table deliberately.
 */
export const orgRoleEnum = pgEnum('org_role', [
	'owner',
	'admin',
	'recruiter',
	'hiring_manager',
	'interviewer',
	'viewer'
]);

export const organizations = pgTable(
	'organizations',
	{
		...baseSoftDeleteColumns,
		name: text('name').notNull(),
		/** Appears in employer URLs (`/hire/<slug>`), so it must be stable and unique. */
		slug: text('slug').notNull(),
		/** Verified against DNS before a company gets the "verified employer" badge. */
		domain: text('domain'),
		domainVerifiedAt: timestamp('domain_verified_at', { withTimezone: true, mode: 'date' }),
		/**
		 * The value the company has to publish as a TXT record to prove the domain
		 * is theirs.
		 *
		 * Per organization and regenerated whenever the domain changes, so a token
		 * left in DNS by a previous owner cannot verify a new one. Kept after a
		 * successful check rather than cleared: re-checking later is how a domain
		 * that changed hands stops being verified, and that needs the token.
		 */
		domainToken: text('domain_token'),
		domainCheckedAt: timestamp('domain_checked_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [uniqueIndex('organizations_slug_key').on(table.slug)]
);

export const orgMembers = pgTable(
	'org_members',
	{
		...baseColumns,
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		role: orgRoleEnum('role').notNull().default('viewer')
	},
	(table) => [
		// One membership per person per org; a role change is an update, not a second row.
		uniqueIndex('org_members_org_user_key').on(table.organizationId, table.userId),
		index('org_members_user_idx').on(table.userId)
	]
);

export const orgInvites = pgTable(
	'org_invites',
	{
		...primaryKeyColumn,
		...timestampColumns,
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		email: text('email').notNull(),
		role: orgRoleEnum('role').notNull().default('viewer'),
		invitedByUserId: uuid('invited_by_user_id').references(() => users.id, {
			onDelete: 'set null'
		}),
		/** Hashed like every other emailed token. */
		tokenHash: text('token_hash').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
		acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		uniqueIndex('org_invites_token_hash_key').on(table.tokenHash),
		index('org_invites_org_email_idx').on(table.organizationId, table.email)
	]
);

export type Organization = typeof organizations.$inferSelect;
export type OrgMember = typeof orgMembers.$inferSelect;
export type OrgRole = (typeof orgRoleEnum.enumValues)[number];
