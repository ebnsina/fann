import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { applications } from '../db/schema/application';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import { apply } from './application';
import {
	GHOSTED_DAYS,
	GRACE_DAYS,
	MIN_SAMPLE,
	describeStats,
	statsForCompanies,
	statsForCompany
} from './reputation';

/** Unique per spec file, so cleanup cannot reach another suite's rows. */
const SUITE = 'reputation';

describe.skipIf(!databaseReachable)('employer response statistics', () => {
	let fixture: JobFixture;

	beforeAll(async () => {
		fixture = await createJobFixture(SUITE);
	});

	afterAll(async () => {
		await fixture.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	/**
	 * An application aged backwards into the past.
	 *
	 * The stats only look at applications older than the grace window, so a test
	 * that creates one now would be measuring an empty set. Ageing is done in SQL
	 * against `now()` for the same reason the service computes there.
	 */
	async function agedApplication(options: {
		daysOld: number;
		respondedAfterDays?: number;
		status?: 'submitted' | 'rejected' | 'withdrawn';
	}): Promise<string> {
		const userId = (await createUser(SUITE)).id;
		const application = await apply({ jobId: fixture.jobId, userId });

		await db
			.update(applications)
			.set({
				createdAt: sql`now() - make_interval(days => ${options.daysOld})`,
				firstRespondedAt:
					options.respondedAfterDays == null
						? null
						: sql`now() - make_interval(days => ${options.daysOld - options.respondedAfterDays})`,
				status: options.status ?? 'submitted'
			})
			.where(eq(applications.id, application.id));

		return application.id;
	}

	it('says nothing at all below the minimum sample', async () => {
		// A company with two applications and two replies is not a company with a
		// 100% response rate. It is a company with two applications.
		await agedApplication({ daysOld: 40, respondedAfterDays: 1 });
		await agedApplication({ daysOld: 40, respondedAfterDays: 1 });

		const stats = await statsForCompany(fixture.companyId);

		expect(stats.settled).toBeLessThan(MIN_SAMPLE);
		expect(stats.confident).toBe(false);
		expect(stats.responseRate).toBeNull();
		expect(stats.medianReplyDays).toBeNull();
		expect(describeStats(stats)).toMatch(/not enough/i);
	});

	it('publishes figures once there is enough history', async () => {
		// Take it past the threshold: three more answered, two ignored.
		await agedApplication({ daysOld: 40, respondedAfterDays: 2 });
		await agedApplication({ daysOld: 40, respondedAfterDays: 2 });
		await agedApplication({ daysOld: 40, respondedAfterDays: 2 });
		await agedApplication({ daysOld: 40 });
		await agedApplication({ daysOld: 40 });

		const stats = await statsForCompany(fixture.companyId);

		expect(stats.confident).toBe(true);
		expect(stats.settled).toBe(7);
		// Five of seven answered.
		expect(stats.responseRate).toBeCloseTo(5 / 7, 2);
		expect(stats.medianReplyDays).toBeGreaterThan(0);
		// Both unanswered ones are past the ghosting threshold.
		expect(stats.ghostedRate).toBeCloseTo(2 / 7, 2);
		expect(describeStats(stats)).toMatch(/replied to 71%/i);
	});

	it('does not count an application still inside the grace window', async () => {
		const before = await statsForCompany(fixture.companyId);

		// Somebody who applied this morning is waiting, not ignored. Counting them
		// would punish a company for the time of day.
		await agedApplication({ daysOld: GRACE_DAYS - 1 });

		const after = await statsForCompany(fixture.companyId);
		expect(after.settled).toBe(before.settled);
	});

	it('does not count a withdrawal against the company', async () => {
		const before = await statsForCompany(fixture.companyId);

		// Otherwise anyone could damage an employer's record by applying and
		// immediately pulling out.
		await agedApplication({ daysOld: 40, status: 'withdrawn' });

		const after = await statsForCompany(fixture.companyId);
		expect(after.settled).toBe(before.settled);
	});

	it('counts silence as ghosting only past the threshold', async () => {
		const before = await statsForCompany(fixture.companyId);
		const ghostedBefore = Math.round((before.ghostedRate ?? 0) * before.settled);

		// Unanswered, but not yet silent for long enough to be a non-answer.
		await agedApplication({ daysOld: GHOSTED_DAYS - 2 });

		const after = await statsForCompany(fixture.companyId);
		const ghostedAfter = Math.round((after.ghostedRate ?? 0) * after.settled);

		expect(after.settled).toBe(before.settled + 1);
		expect(ghostedAfter).toBe(ghostedBefore);
	});

	it('gives the same answer for one company as for a list', async () => {
		// Two versions of "what counts as ghosted" is how a directory ends up
		// disagreeing with the page it links to.
		const single = await statsForCompany(fixture.companyId);
		const batch = await statsForCompanies([fixture.companyId]);

		expect(batch.get(fixture.companyId)?.settled).toBe(single.settled);
		expect(batch.get(fixture.companyId)?.responseRate).toBeCloseTo(single.responseRate ?? 0, 5);
	});

	it('returns a known-nothing entry for a company with no history', async () => {
		const other = await createJobFixture(`${SUITE}-quiet`);

		const batch = await statsForCompanies([fixture.companyId, other.companyId]);
		const quiet = batch.get(other.companyId);

		// Present but empty, rather than missing — a caller that has to guess why an
		// id vanished will guess wrong.
		expect(quiet).toBeDefined();
		expect(quiet?.confident).toBe(false);
		expect(quiet?.settled).toBe(0);

		await other.cleanup();
	});

	it('returns an empty map for an empty list rather than querying', async () => {
		expect((await statsForCompanies([])).size).toBe(0);
	});
});
