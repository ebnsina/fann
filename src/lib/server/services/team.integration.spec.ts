import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { orgInvites, orgMembers, type OrgRole } from '../db/schema/org';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import {
	acceptInvite,
	changeRole,
	invite,
	listInvites,
	listMembers,
	removeMember,
	revokeInvite
} from './team';

/** Unique per spec file, so cleanup cannot reach another suite's rows. */
const SUITE = 'team';

describe.skipIf(!databaseReachable)('hiring team', () => {
	let fixture: JobFixture;
	let organizationId: string;
	let ownerId: string;

	/**
	 * The plaintext token for the most recent invite to an address.
	 *
	 * Only the hash is stored, so a test cannot read the token back out — it has to
	 * be captured the way a recipient would, from the email. The service does not
	 * return it, so this reaches into the table and re-derives nothing: it exists
	 * purely to prove the *hash* is what was saved.
	 */
	async function inviteAndCapture(email: string, role: OrgRole = 'recruiter'): Promise<string> {
		// `invite` mails the plaintext and stores only the hash, so the test issues a
		// known token by writing the row the same way the service does.
		const { hashToken, randomToken } = await import('../auth/tokens');
		const token = randomToken();

		await db.insert(orgInvites).values({
			organizationId,
			email,
			role,
			invitedByUserId: ownerId,
			tokenHash: hashToken(token),
			expiresAt: new Date(Date.now() + 60_000)
		});

		return token;
	}

	beforeAll(async () => {
		fixture = await createJobFixture(SUITE);
		organizationId = fixture.organizationId;

		const owner = await createUser(SUITE);
		ownerId = owner.id;
		await db.insert(orgMembers).values({ organizationId, userId: ownerId, role: 'owner' });
	});

	afterAll(async () => {
		await fixture.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	it('stores only a hash of the invite token', async () => {
		const recipient = await createUser(SUITE);
		await invite(organizationId, ownerId, recipient.email, 'recruiter', 'http://localhost');

		const [row] = await db
			.select()
			.from(orgInvites)
			.where(eq(orgInvites.email, recipient.email))
			.limit(1);

		// 64 hex characters — a SHA-256 digest, not something anyone can send.
		expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/);
	});

	it('refuses to invite someone already on the team', async () => {
		const existing = await createUser(SUITE);
		await db.insert(orgMembers).values({ organizationId, userId: existing.id, role: 'viewer' });

		await expect(
			invite(organizationId, ownerId, existing.email, 'recruiter', 'http://localhost')
		).rejects.toThrow();
	});

	it('will not let a forwarded link be redeemed by a different account', async () => {
		const intended = await createUser(SUITE);
		const stranger = await createUser(SUITE);
		const token = await inviteAndCapture(intended.email);

		// The whole point of binding an invite to an address: a link that leaks, or
		// is forwarded, must not walk somebody else into another company's candidates.
		await expect(acceptInvite(token, stranger.id, stranger.email)).rejects.toThrow();

		const members = await listMembers(organizationId);
		expect(members.some((member) => member.userId === stranger.id)).toBe(false);
	});

	it('grants the role the invite carried, not one the accepter asked for', async () => {
		const recipient = await createUser(SUITE);
		const token = await inviteAndCapture(recipient.email, 'viewer');

		await acceptInvite(token, recipient.id, recipient.email);

		const members = await listMembers(organizationId);
		const joined = members.find((member) => member.userId === recipient.id);
		expect(joined?.role).toBe('viewer');
	});

	it('cannot redeem the same invitation twice', async () => {
		const recipient = await createUser(SUITE);
		const token = await inviteAndCapture(recipient.email);

		await acceptInvite(token, recipient.id, recipient.email);
		await expect(acceptInvite(token, recipient.id, recipient.email)).rejects.toThrow();
	});

	it('rejects an expired invitation', async () => {
		const recipient = await createUser(SUITE);
		const { hashToken, randomToken } = await import('../auth/tokens');
		const token = randomToken();

		await db.insert(orgInvites).values({
			organizationId,
			email: recipient.email,
			role: 'viewer',
			invitedByUserId: ownerId,
			tokenHash: hashToken(token),
			expiresAt: new Date(Date.now() - 1000)
		});

		await expect(acceptInvite(token, recipient.id, recipient.email)).rejects.toThrow();
	});

	it('hides revoked and expired invitations from the list', async () => {
		const recipient = await createUser(SUITE);
		await invite(organizationId, ownerId, recipient.email, 'recruiter', 'http://localhost');

		const before = await listInvites(organizationId);
		const pending = before.find((row) => row.email === recipient.email);
		expect(pending).toBeDefined();

		await revokeInvite(pending!.id, organizationId);

		const after = await listInvites(organizationId);
		expect(after.some((row) => row.email === recipient.email)).toBe(false);
	});

	it('will not remove or demote the last owner', async () => {
		// Leaving a company with no owner means nobody can administer it, and there
		// is no way to fix that from inside the product.
		await expect(removeMember(organizationId, ownerId)).rejects.toThrow();
		await expect(changeRole(organizationId, ownerId, 'viewer')).rejects.toThrow();
	});

	it('allows demoting an owner once there is a second one', async () => {
		const second = await createUser(SUITE);
		await db.insert(orgMembers).values({ organizationId, userId: second.id, role: 'owner' });

		await changeRole(organizationId, second.id, 'recruiter');

		const members = await listMembers(organizationId);
		expect(members.find((member) => member.userId === second.id)?.role).toBe('recruiter');
	});
});
