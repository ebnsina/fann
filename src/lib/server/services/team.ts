import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { users } from '../db/schema/identity';
import { orgInvites, orgMembers, organizations, type OrgRole } from '../db/schema/org';
import { deliver } from '../notifications';
import { hashToken, randomToken } from '../auth/tokens';

/**
 * Who is on a hiring team, and how they get there.
 *
 * Two rules run through this file:
 *
 *   1. **An organization is never left without an owner.** Removing the last one,
 *      or demoting them, would leave a company nobody can administer and no way
 *      to fix it from inside the product.
 *   2. **An invite is a hashed token with an expiry**, exactly like a password
 *      reset. It carries a role, so accepting it grants what was offered and not
 *      whatever the accepter asks for.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface TeamMember {
	userId: string;
	name: string;
	email: string;
	role: OrgRole;
	joinedAt: Date;
}

export interface PendingInvite {
	id: string;
	email: string;
	role: OrgRole;
	invitedBy: string | null;
	expiresAt: Date;
}

export async function listMembers(organizationId: string): Promise<TeamMember[]> {
	return db
		.select({
			userId: users.id,
			name: users.name,
			email: users.email,
			role: orgMembers.role,
			joinedAt: orgMembers.createdAt
		})
		.from(orgMembers)
		.innerJoin(users, eq(users.id, orgMembers.userId))
		.where(eq(orgMembers.organizationId, organizationId))
		.orderBy(asc(orgMembers.createdAt));
}

/** Invitations that are still worth showing — unaccepted and unexpired. */
export async function listInvites(organizationId: string): Promise<PendingInvite[]> {
	const rows = await db
		.select({
			id: orgInvites.id,
			email: orgInvites.email,
			role: orgInvites.role,
			expiresAt: orgInvites.expiresAt,
			invitedBy: users.name
		})
		.from(orgInvites)
		.leftJoin(users, eq(users.id, orgInvites.invitedByUserId))
		.where(
			and(
				eq(orgInvites.organizationId, organizationId),
				isNull(orgInvites.acceptedAt),
				gt(orgInvites.expiresAt, new Date())
			)
		)
		.orderBy(asc(orgInvites.createdAt));

	return rows.map((row) => ({ ...row, invitedBy: row.invitedBy ?? null }));
}

/** How many owners the organization has — the number both guards below protect. */
async function ownerCount(organizationId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(orgMembers)
		.where(and(eq(orgMembers.organizationId, organizationId), eq(orgMembers.role, 'owner')));

	return row?.count ?? 0;
}

export async function invite(
	organizationId: string,
	invitedByUserId: string,
	email: string,
	role: OrgRole,
	origin: string
): Promise<void> {
	// Already on the team. Silently issuing a second invite would send a link that
	// does nothing and leave the sender wondering why.
	const [existing] = await db
		.select({ id: orgMembers.id })
		.from(orgMembers)
		.innerJoin(users, eq(users.id, orgMembers.userId))
		.where(and(eq(orgMembers.organizationId, organizationId), eq(users.email, email)))
		.limit(1);

	if (existing) error(409, 'That person is already on the team.');

	const token = randomToken();

	await db.insert(orgInvites).values({
		organizationId,
		email,
		role,
		invitedByUserId,
		tokenHash: hashToken(token),
		expiresAt: new Date(Date.now() + INVITE_TTL_MS)
	});

	const [organization] = await db
		.select({ name: organizations.name })
		.from(organizations)
		.where(eq(organizations.id, organizationId))
		.limit(1);

	// Through `deliver`, not the mail driver: every attempt lands in `email_log`,
	// so "we invited them" is checkable rather than hopeful. It never throws — a
	// mail outage must not roll back an invitation already recorded.
	await deliver({
		to: { email, name: email },
		subject: `You have been invited to hire at ${organization?.name ?? 'a company'} on Fann`,
		tag: 'org.invite',
		text: [
			`You have been invited to join ${organization?.name ?? 'a company'} on Fann as a ${role.replace('_', ' ')}.`,
			'',
			`${origin}/invite?token=${token}`,
			'',
			'This link expires in seven days. If you were not expecting it, ignore this email.'
		].join('\n')
	});
}

export async function revokeInvite(inviteId: string, organizationId: string): Promise<void> {
	const deleted = await db
		.delete(orgInvites)
		.where(and(eq(orgInvites.id, inviteId), eq(orgInvites.organizationId, organizationId)))
		.returning({ id: orgInvites.id });

	if (deleted.length === 0) error(404, 'Not found.');
}

/**
 * Accept an invitation.
 *
 * The role comes from the invite, never from the request. Otherwise the link is a
 * self-service promotion to owner for anyone who reads the network tab.
 */
export async function acceptInvite(
	token: string,
	userId: string,
	userEmail: string
): Promise<{ organizationSlug: string }> {
	const [invite] = await db
		.select()
		.from(orgInvites)
		.where(and(eq(orgInvites.tokenHash, hashToken(token)), isNull(orgInvites.acceptedAt)))
		.limit(1);

	if (!invite || invite.expiresAt < new Date()) {
		error(400, 'That invitation has expired or has already been used.');
	}

	// Bound to the address it was sent to. A forwarded link must not let a
	// different person walk into someone else's hiring data.
	if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
		error(403, 'That invitation was sent to a different email address.');
	}

	const [organization] = await db
		.select({ slug: organizations.slug })
		.from(organizations)
		.where(eq(organizations.id, invite.organizationId))
		.limit(1);

	if (!organization) error(404, 'Not found.');

	await db.transaction(async (tx) => {
		await tx
			.insert(orgMembers)
			.values({ organizationId: invite.organizationId, userId, role: invite.role })
			// Already a member: keep the membership they have rather than downgrading
			// them to whatever this invite happened to offer.
			.onConflictDoNothing();

		await tx.update(orgInvites).set({ acceptedAt: new Date() }).where(eq(orgInvites.id, invite.id));
	});

	return { organizationSlug: organization.slug };
}

export async function changeRole(
	organizationId: string,
	userId: string,
	role: OrgRole
): Promise<void> {
	const [member] = await db
		.select({ role: orgMembers.role })
		.from(orgMembers)
		.where(and(eq(orgMembers.organizationId, organizationId), eq(orgMembers.userId, userId)))
		.limit(1);

	if (!member) error(404, 'Not found.');

	// Demoting the last owner leaves a company nobody can administer, with no way
	// to fix it from inside the product.
	if (member.role === 'owner' && role !== 'owner' && (await ownerCount(organizationId)) <= 1) {
		error(400, 'Make someone else an owner first.');
	}

	await db
		.update(orgMembers)
		.set({ role })
		.where(and(eq(orgMembers.organizationId, organizationId), eq(orgMembers.userId, userId)));
}

export async function removeMember(organizationId: string, userId: string): Promise<void> {
	const [member] = await db
		.select({ role: orgMembers.role })
		.from(orgMembers)
		.where(and(eq(orgMembers.organizationId, organizationId), eq(orgMembers.userId, userId)))
		.limit(1);

	if (!member) error(404, 'Not found.');

	if (member.role === 'owner' && (await ownerCount(organizationId)) <= 1) {
		error(400, 'An organization needs at least one owner.');
	}

	await db
		.delete(orgMembers)
		.where(and(eq(orgMembers.organizationId, organizationId), eq(orgMembers.userId, userId)));
}
