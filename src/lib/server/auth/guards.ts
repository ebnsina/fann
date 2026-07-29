import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { getRequestEvent } from '$app/server';
import { db } from '../db';
import { organizations, orgMembers, type OrgRole } from '../db/schema/org';
import type { User } from '../db/schema/identity';
import { can, type Permission } from './permissions';

/**
 * Authorization helpers for remote functions.
 *
 * Remote functions compile to plain HTTP endpoints, so route-group nesting proves
 * nothing about who is calling. Every non-public remote function starts with one of
 * these — there is no ambient protection to fall back on.
 */

/** The signed-in user, or 401. */
export function requireUser(): User {
	const { locals } = getRequestEvent();
	if (!locals.user) error(401, 'You need to be signed in.');
	return locals.user;
}

/** A signed-in user with a verified email address. */
export function requireVerifiedUser(): User {
	const user = requireUser();
	if (!user.emailVerifiedAt) error(403, 'Please verify your email address first.');
	return user;
}

export interface OrgContext {
	user: User;
	organizationId: string;
	organizationSlug: string;
	role: OrgRole;
}

/**
 * Resolve the caller's membership of an organization by slug.
 *
 * Returns 404 rather than 403 when the user is not a member: confirming that an org
 * exists to someone with no access leaks the customer list.
 */
export async function requireOrgMember(slug: string): Promise<OrgContext> {
	const user = requireUser();

	const [row] = await db
		.select({ organization: organizations, member: orgMembers })
		.from(organizations)
		.innerJoin(
			orgMembers,
			and(eq(orgMembers.organizationId, organizations.id), eq(orgMembers.userId, user.id))
		)
		.where(and(eq(organizations.slug, slug), isNull(organizations.deletedAt)))
		.limit(1);

	if (!row) error(404, 'Not found.');

	return {
		user,
		organizationId: row.organization.id,
		organizationSlug: row.organization.slug,
		role: row.member.role
	};
}

/** Membership plus a specific permission. */
export async function requirePermission(slug: string, permission: Permission): Promise<OrgContext> {
	const context = await requireOrgMember(slug);
	if (!can(context.role, permission)) {
		error(403, 'You do not have permission to do that.');
	}
	return context;
}
