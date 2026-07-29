import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { applications } from '../db/schema/application';
import { jobStages, stageTransitions } from '../db/schema/ats';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import { apply, withdraw } from './application';
import { MIN_SAMPLE, bySource, funnel, headline, timeInStage } from './analytics';

/** Unique per spec file, so cleanup cannot reach another suite's rows. */
const SUITE = 'analytics';

describe.skipIf(!databaseReachable)('hiring reports', () => {
	let fixture: JobFixture;
	let stages: Record<string, string>;

	beforeAll(async () => {
		fixture = await createJobFixture(SUITE);

		const rows = await db
			.insert(jobStages)
			.values([
				{ jobId: fixture.jobId, name: 'Applied', kind: 'applied', position: 0 },
				{ jobId: fixture.jobId, name: 'Screening', kind: 'screening', position: 1 },
				{ jobId: fixture.jobId, name: 'Interview', kind: 'interview', position: 2 },
				{ jobId: fixture.jobId, name: 'Offer', kind: 'offer', position: 3 },
				{ jobId: fixture.jobId, name: 'Hired', kind: 'hired', position: 4 }
			])
			.returning();

		stages = Object.fromEntries(rows.map((row) => [row.kind, row.id]));
	});

	afterAll(async () => {
		await fixture.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	const scope = () => ({ organizationId: fixture.organizationId });

	/** An application, optionally walked forward with a day between each move. */
	async function applicant(path: string[] = []): Promise<string> {
		const userId = (await createUser(SUITE)).id;
		const application = await apply({ jobId: fixture.jobId, userId });

		for (const [index, kind] of path.entries()) {
			await db.insert(stageTransitions).values({
				applicationId: application.id,
				toStageId: stages[kind],
				// Ageing in SQL, not from a JS Date — the same reason every other
				// service does: one clock, and no interpolated Date reaching the driver.
				createdAt: sql`now() - make_interval(days => ${(path.length - index) * 2})`
			});
		}

		return application.id;
	}

	it('counts everyone who applied, including people nobody has touched', async () => {
		await applicant();
		await applicant(['applied', 'screening']);

		// `apply()` does not place anybody into a stage, so an untouched application
		// has no transition row. Counting the first step from transitions would omit
		// exactly the group this report is most useful for surfacing.
		const steps = await funnel(scope());
		const applied = steps.find((step) => step.kind === 'applied');

		expect(applied?.reached).toBeGreaterThanOrEqual(2);
	});

	it('counts a stage once however often somebody re-enters it', async () => {
		const applicationId = await applicant(['applied', 'interview']);

		// Back to screening and forward again — a team that moves somebody between
		// two interview rounds has interviewed one person, not three.
		await db.insert(stageTransitions).values([
			{ applicationId, toStageId: stages.screening },
			{ applicationId, toStageId: stages.interview }
		]);

		const before = (await funnel(scope())).find((step) => step.kind === 'interview')?.reached ?? 0;
		await db.insert(stageTransitions).values({ applicationId, toStageId: stages.interview });
		const after = (await funnel(scope())).find((step) => step.kind === 'interview')?.reached ?? 0;

		expect(after).toBe(before);
	});

	it('does not report a conversion rate off an empty step', async () => {
		const steps = await funnel(scope());

		// "0% of nobody" is not a conversion rate, and drawing it as one invents a
		// problem that is not there.
		for (const [index, step] of steps.entries()) {
			if (index === 0) expect(step.conversion).toBeNull();
			else if (steps[index - 1].reached === 0) expect(step.conversion).toBeNull();
		}
	});

	it('does not count a withdrawal as somebody left waiting', async () => {
		const before = await headline(scope());

		const userId = (await createUser(SUITE)).id;
		const application = await apply({ jobId: fixture.jobId, userId });
		await withdraw(application.id, userId);

		// A withdrawal is the candidate's decision. Counting it would let anyone
		// damage a team's figures by applying and immediately pulling out.
		const after = await headline(scope());
		expect(after.awaitingReply).toBe(before.awaitingReply);
	});

	it('hides a median until there is enough to average', async () => {
		const report = await headline(scope());

		// Nothing in this fixture has been replied to, so there is no sample at all.
		expect(report.responseSample).toBeLessThan(MIN_SAMPLE);
		expect(report.medianResponseDays).toBeNull();
	});

	it('groups stages by kind across jobs and by name within one', async () => {
		await applicant(['applied', 'screening', 'interview']);

		// Stages belong to a job, so an organization with several jobs has several
		// "Interview" columns. Listing them unaggregated showed the same name over
		// and over with no way to tell them apart.
		const across = await timeInStage({ organizationId: fixture.organizationId });
		const kinds = across.map((row) => row.kind);
		expect(new Set(kinds).size).toBe(kinds.length);

		const within = await timeInStage({
			organizationId: fixture.organizationId,
			jobId: fixture.jobId
		});
		// Within one job the real column names come back, because there they
		// identify something.
		expect(within.some((row) => row.name === 'Screening')).toBe(true);
	});

	it('measures a completed spell but not an open-ended one', async () => {
		await applicant(['applied', 'screening', 'interview']);

		const stages = await timeInStage({
			organizationId: fixture.organizationId,
			jobId: fixture.jobId
		});

		// The last stage somebody entered has no end, so it contributes to "waiting"
		// rather than to the median — folding an open wait into an average makes a
		// slow stage look faster the longer somebody is stuck in it.
		const interview = stages.find((row) => row.kind === 'interview');
		expect(interview?.waiting).toBeGreaterThan(0);
	});

	it('refuses to answer for another organization', async () => {
		const other = await createJobFixture(`${SUITE}-other`);
		const userId = (await createUser(SUITE)).id;
		await apply({ jobId: other.jobId, userId });

		// The scope is applied in SQL, not filtered afterwards. This asserts one
		// organization's report cannot see another's applications.
		const steps = await funnel({ organizationId: other.organizationId });
		const mine = await funnel(scope());

		expect(steps.find((s) => s.kind === 'applied')?.reached).toBe(1);
		expect(mine.find((s) => s.kind === 'applied')?.reached).toBeGreaterThan(1);

		await other.cleanup();
	});

	it('reports sources without a rate below the minimum sample', async () => {
		const sources = await bySource(scope());

		for (const source of sources) {
			if (source.applications < MIN_SAMPLE) expect(source.hireRate).toBeNull();
			else expect(source.hireRate).not.toBeNull();
		}
	});

	it('keeps every application countable after a job is scoped', async () => {
		const [row] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(applications)
			.where(eq(applications.organizationId, fixture.organizationId));

		const steps = await funnel({ organizationId: fixture.organizationId, jobId: fixture.jobId });
		expect(steps[0].reached).toBe(row.count);
	});
});
