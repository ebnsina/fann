import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { users } from '../db/schema/identity';
import { jobs } from '../db/schema/job';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import {
	assertStaff,
	failedEmails,
	findUsers,
	listJobs,
	listOrganizations,
	overview,
	setJobTakenDown
} from './admin';

const SUITE = 'admin';

describe.skipIf(!databaseReachable)('the platform console', () => {
	let staffId: string;
	let outsiderId: string;
	let fixture: JobFixture;

	beforeAll(async () => {
		staffId = (await createUser(SUITE)).id;
		outsiderId = (await createUser(SUITE)).id;
		fixture = await createJobFixture(SUITE);

		// Set by hand, exactly as the product requires — there is no code path that
		// grants this, and that is the point.
		await db.update(users).set({ platformAdmin: true }).where(eq(users.id, staffId));
	});

	afterAll(async () => {
		await fixture.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	describe('the guard', () => {
		it('denies everything to somebody who is not staff', async () => {
			// Not-found rather than forbidden, so probing does not confirm the console
			// exists — the same choice moderation.ts makes.
			await expect(assertStaff(outsiderId)).rejects.toMatchObject({ status: 404 });
			await expect(overview(outsiderId)).rejects.toMatchObject({ status: 404 });
			await expect(findUsers(outsiderId, 'fixture')).rejects.toMatchObject({ status: 404 });
			await expect(listOrganizations(outsiderId)).rejects.toMatchObject({ status: 404 });
			await expect(listJobs(outsiderId)).rejects.toMatchObject({ status: 404 });
			await expect(failedEmails(outsiderId)).rejects.toMatchObject({ status: 404 });
			await expect(setJobTakenDown(outsiderId, fixture.jobId, true)).rejects.toMatchObject({
				status: 404
			});
		});

		it('lets staff through', async () => {
			await expect(assertStaff(staffId)).resolves.toBeUndefined();
		});
	});

	it('refuses to page through every account, so it cannot become an export', async () => {
		// A term this short returns nothing at all rather than everybody.
		expect(await findUsers(staffId, 'a')).toHaveLength(0);
		expect(await findUsers(staffId, ' ')).toHaveLength(0);

		const found = await findUsers(staffId, 'fixture-admin');
		expect(found.length).toBeGreaterThan(0);
	});

	it('counts what somebody could act on', async () => {
		const stats = await overview(staffId);

		expect(stats.users).toBeGreaterThan(0);
		expect(stats.publishedJobs).toBeGreaterThan(0);
		// Both of these mean "somebody should do something", which is the whole
		// reason the overview is not a sign-up counter.
		expect(typeof stats.awaitingAnswer).toBe('number');
		expect(typeof stats.emailsFailed).toBe('number');
	});

	it('takes a listing down reversibly, and restores it as a draft', async () => {
		await setJobTakenDown(staffId, fixture.jobId, true);

		let [job] = await db.select().from(jobs).where(eq(jobs.id, fixture.jobId));
		expect(job.deletedAt).not.toBeNull();
		expect(job.status).toBe('closed');

		await setJobTakenDown(staffId, fixture.jobId, false);

		[job] = await db.select().from(jobs).where(eq(jobs.id, fixture.jobId));
		expect(job.deletedAt).toBeNull();
		// Draft, never straight back onto the board: re-publishing somebody else's
		// listing on their behalf is the company's decision.
		expect(job.status).toBe('draft');
	});

	it('has no way to grant staff access', async () => {
		// The console is read-only except for taking a listing down. If a function
		// ever appears here that writes `platformAdmin`, this is the test that
		// should have to be deleted first.
		const module = await import('./admin');
		const writes = Object.keys(module).filter((name) => /admin|staff|role|promote/i.test(name));

		expect(writes.sort()).toEqual(['assertStaff']);
	});
});
