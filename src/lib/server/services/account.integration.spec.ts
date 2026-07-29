import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { applications } from '../db/schema/application';
import { candidateProfiles } from '../db/schema/candidate';
import { users } from '../db/schema/identity';
import { savedJobs } from '../db/schema/job';
import { orgMembers } from '../db/schema/org';
import { salarySubmissions } from '../db/schema/salary';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import { apply } from './application';
import { deleteAccount, deletionBlocker, exportFor } from './account';
import { save } from './saved-job';
import { save as saveProfile } from './profile';

/** Unique per spec file, so cleanup cannot reach another suite's rows. */
const SUITE = 'account';

describe.skipIf(!databaseReachable)('closing an account', () => {
	let fixture: JobFixture;

	beforeAll(async () => {
		fixture = await createJobFixture(SUITE);
	});

	afterAll(async () => {
		await fixture.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	async function candidateWithHistory(): Promise<{ userId: string; applicationId: string }> {
		const userId = (await createUser(SUITE)).id;

		const application = await apply({ jobId: fixture.jobId, userId });
		await save(fixture.jobId, userId);
		await saveProfile(userId, {
			headline: 'Backend engineer',
			summary: '',
			visibility: 'private',
			openToWork: true,
			desiredSalaryCurrency: 'USD',
			workAuthorization: '',
			websiteUrl: '',
			linkedinUrl: '',
			githubUrl: ''
		});

		return { userId, applicationId: application.id };
	}

	it('gives somebody their own data back', async () => {
		const { userId } = await candidateWithHistory();

		const data = await exportFor(userId);

		expect(data.account.email).toContain('@');
		expect(data.profile?.headline).toBe('Backend engineer');
		expect(data.applications).toHaveLength(1);
		expect(data.savedJobs).toHaveLength(1);
	});

	it('keeps the application but takes the person off it', async () => {
		const { userId, applicationId } = await candidateWithHistory();

		await deleteAccount(userId);

		// The whole reason this is an anonymisation and not a delete. The foreign key
		// cascades, so dropping the user row would erase the employer's record of
		// hiring that may still be in progress.
		const [application] = await db
			.select({ id: applications.id })
			.from(applications)
			.where(eq(applications.id, applicationId));
		expect(application).toBeDefined();

		const [account] = await db.select().from(users).where(eq(users.id, userId));
		expect(account.name).toBe('Deleted account');
		expect(account.passwordHash).toBeNull();
		expect(account.deactivatedAt).not.toBeNull();
		// A routable address left behind is the one field that could still identify
		// somebody, so it is replaced rather than blanked — the column is unique.
		expect(account.email).toMatch(/^deleted-.*@deleted\.invalid$/);
	});

	it('destroys the profile and the saved jobs outright', async () => {
		const { userId } = await candidateWithHistory();

		await deleteAccount(userId);

		expect(
			await db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, userId))
		).toHaveLength(0);
		expect(await db.select().from(savedJobs).where(eq(savedJobs.userId, userId))).toHaveLength(0);
		expect(await db.select().from(orgMembers).where(eq(orgMembers.userId, userId))).toHaveLength(0);
	});

	it('unlinks a reported salary rather than deleting it', async () => {
		const userId = (await createUser(SUITE)).id;

		const [submission] = await db
			.insert(salarySubmissions)
			.values({
				userId,
				jobTitle: 'Backend Engineer',
				experienceLevel: 'senior',
				salaryAmount: 150_000,
				salaryCurrency: 'USD',
				salaryPeriod: 'year'
			})
			.returning();

		await deleteAccount(userId);

		// The figure is already anonymous and already baked into published
		// benchmarks. Deleting it would let one person closing their account quietly
		// move what the market appears to pay.
		const [after] = await db
			.select()
			.from(salarySubmissions)
			.where(eq(salarySubmissions.id, submission.id));

		expect(after).toBeDefined();
		expect(after.userId).toBeNull();
	});

	it('refuses while somebody is the only owner of a company', async () => {
		// The fixture organization has no members of its own, so the ownership under
		// test is created here rather than assumed.
		const org = await createJobFixture(`${SUITE}-owner`);
		const userId = (await createUser(SUITE)).id;
		await db
			.insert(orgMembers)
			.values({ organizationId: org.organizationId, userId, role: 'owner' });

		// Otherwise the company is left with nobody who can administer it, holding
		// other people's jobs and other candidates' applications.
		const blocker = await deletionBlocker(userId);
		expect(blocker).toMatch(/only owner/i);
		await expect(deleteAccount(userId)).rejects.toThrow();

		await org.cleanup();
	});

	it('allows it once somebody else is also an owner', async () => {
		const org = await createJobFixture(`${SUITE}-coowner`);
		const leaving = (await createUser(SUITE)).id;
		const staying = (await createUser(SUITE)).id;

		await db.insert(orgMembers).values([
			{ organizationId: org.organizationId, userId: leaving, role: 'owner' },
			{ organizationId: org.organizationId, userId: staying, role: 'owner' }
		]);

		// The rule is about leaving a company unadministered, not about owners never
		// leaving. A co-owner means the invariant still holds after they go.
		expect(await deletionBlocker(leaving)).toBeNull();

		await org.cleanup();
	});

	it('lets an ordinary candidate close without a blocker', async () => {
		const { userId } = await candidateWithHistory();
		expect(await deletionBlocker(userId)).toBeNull();
	});
});
