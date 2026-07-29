import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { applications } from '../db/schema/application';
import { stageTransitions } from '../db/schema/ats';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import { apply } from './application';
import {
	addStage,
	board,
	createStagesForJob,
	deleteStage,
	ensureStages,
	listStages,
	moveToStage,
	reorderStages
} from './pipeline';

/** Unique per spec file, so cleanup cannot reach another suite's rows. */
const SUITE = 'pipeline';

describe.skipIf(!databaseReachable)('hiring pipeline', () => {
	let fixture: JobFixture;
	let jobId: string;
	let organizationId: string;
	let employerId: string;

	/** The job's stages, keyed by kind — the tests care about meaning, not order. */
	let stageByKind: Record<string, string>;

	async function freshCandidate(): Promise<string> {
		return (await createUser(SUITE)).id;
	}

	/** A brand new application sitting in the first column. */
	async function freshApplication(): Promise<string> {
		const userId = await freshCandidate();
		const application = await apply({ jobId, userId });
		await db
			.update(applications)
			.set({ currentStageId: stageByKind.applied })
			.where(eq(applications.id, application.id));
		return application.id;
	}

	beforeAll(async () => {
		// Its own job: these tests add, delete and reorder columns, which would be
		// visible to any other suite sharing the fixture.
		fixture = await createJobFixture(SUITE);
		jobId = fixture.jobId;
		organizationId = fixture.organizationId;
		employerId = await freshCandidate();

		// `createJobFixture` inserts the row directly rather than going through the
		// job service, so it has no stages of its own.
		await createStagesForJob(jobId, organizationId);
		const stages = await listStages(jobId);
		stageByKind = Object.fromEntries(stages.map((stage) => [stage.kind, stage.id]));
	});

	afterAll(async () => {
		await fixture.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	it('gives a job an ordered set of stages', async () => {
		const stages = await listStages(jobId);

		expect(stages.length).toBeGreaterThan(1);
		expect(stages[0].kind).toBe('applied');
		expect(stages.at(-1)?.kind).toBe('rejected');
		// Strictly increasing, or the board's column order is whatever Postgres
		// happens to return first.
		expect(stages.map((stage) => stage.position)).toEqual(
			[...stages.map((stage) => stage.position)].sort((a, b) => a - b)
		);
	});

	it('takes the status from the stage it is moved into', async () => {
		const applicationId = await freshApplication();

		const result = await moveToStage({
			applicationId,
			toStageId: stageByKind.interview,
			organizationId,
			actorUserId: employerId
		});

		expect(result.status).toBe('interviewing');
	});

	it('stamps the response clock on the first move and never again', async () => {
		const applicationId = await freshApplication();

		await moveToStage({
			applicationId,
			toStageId: stageByKind.screening,
			organizationId,
			actorUserId: employerId
		});

		const [afterFirst] = await db
			.select({ firstRespondedAt: applications.firstRespondedAt })
			.from(applications)
			.where(eq(applications.id, applicationId));

		expect(afterFirst.firstRespondedAt).not.toBeNull();

		// Dragging the card back to the first column must not un-respond to anyone.
		// A company that replies fast and then goes quiet cannot be allowed to reset
		// its own response time by moving a card backwards and forwards.
		await moveToStage({
			applicationId,
			toStageId: stageByKind.applied,
			organizationId,
			actorUserId: employerId
		});

		const [afterBack] = await db
			.select({ firstRespondedAt: applications.firstRespondedAt, status: applications.status })
			.from(applications)
			.where(eq(applications.id, applicationId));

		expect(afterBack.status).toBe('submitted');
		expect(afterBack.firstRespondedAt).toEqual(afterFirst.firstRespondedAt);
	});

	it('writes a transition for every move', async () => {
		const applicationId = await freshApplication();

		await moveToStage({
			applicationId,
			toStageId: stageByKind.screening,
			organizationId,
			actorUserId: employerId
		});
		await moveToStage({
			applicationId,
			toStageId: stageByKind.interview,
			organizationId,
			actorUserId: employerId
		});

		const history = await db
			.select()
			.from(stageTransitions)
			.where(eq(stageTransitions.applicationId, applicationId));

		expect(history).toHaveLength(2);
		expect(history[0].fromStageId).toBe(stageByKind.applied);
		expect(history[1].toStageId).toBe(stageByKind.interview);
	});

	it('refuses to move into a rejecting stage without a reason', async () => {
		const applicationId = await freshApplication();

		await expect(
			moveToStage({
				applicationId,
				toStageId: stageByKind.rejected,
				organizationId,
				actorUserId: employerId
			})
		).rejects.toThrow();

		// And the card has not moved. A half-applied rejection would leave the board
		// and the candidate's dashboard disagreeing.
		const [row] = await db
			.select({ status: applications.status })
			.from(applications)
			.where(eq(applications.id, applicationId));

		expect(row.status).toBe('submitted');
	});

	it('records the reason when one is given', async () => {
		const applicationId = await freshApplication();

		await moveToStage({
			applicationId,
			toStageId: stageByKind.rejected,
			organizationId,
			actorUserId: employerId,
			reason: 'We went with someone more senior.'
		});

		const [row] = await db
			.select({ status: applications.status, reason: applications.rejectionReason })
			.from(applications)
			.where(eq(applications.id, applicationId));

		expect(row.status).toBe('rejected');
		expect(row.reason).toBe('We went with someone more senior.');
	});

	it('will not accept a stage belonging to another job', async () => {
		const other = await createJobFixture(`${SUITE}-other`);
		await createStagesForJob(other.jobId, other.organizationId);
		const [foreign] = await listStages(other.jobId);

		const applicationId = await freshApplication();

		await expect(
			moveToStage({
				applicationId,
				toStageId: foreign.id,
				organizationId,
				actorUserId: employerId
			})
		).rejects.toThrow();

		await other.cleanup();
	});

	it('leaves a withdrawn candidate alone', async () => {
		const applicationId = await freshApplication();
		await db
			.update(applications)
			.set({ status: 'withdrawn', withdrawnAt: new Date() })
			.where(eq(applications.id, applicationId));

		await expect(
			moveToStage({
				applicationId,
				toStageId: stageByKind.interview,
				organizationId,
				actorUserId: employerId
			})
		).rejects.toThrow();
	});

	it('moves people out of a stage before deleting it', async () => {
		const applicationId = await freshApplication();
		const doomed = await addStage(jobId, 'Take-home', 'interview');

		await moveToStage({
			applicationId,
			toStageId: doomed.id,
			organizationId,
			actorUserId: employerId
		});

		await deleteStage(doomed.id, jobId);

		const [row] = await db
			.select({ currentStageId: applications.currentStageId })
			.from(applications)
			.where(eq(applications.id, applicationId));

		// Somewhere real, not null. A null would put them back in the first column,
		// which looks like the product losing track of a person.
		expect(row.currentStageId).not.toBeNull();
		expect(row.currentStageId).not.toBe(doomed.id);
	});

	it('reorders stages without tripping the unique position index', async () => {
		const before = await listStages(jobId);
		const reversed = [...before].reverse().map((stage) => stage.id);

		await reorderStages(jobId, reversed);

		const after = await listStages(jobId);
		expect(after.map((stage) => stage.id)).toEqual(reversed);

		// Put it back, so the tests below still find the stages where they expect.
		await reorderStages(
			jobId,
			before.map((stage) => stage.id)
		);
	});

	it('rejects a reorder that is not the full set', async () => {
		const stages = await listStages(jobId);

		await expect(reorderStages(jobId, [stages[0].id])).rejects.toThrow();
	});

	it('backfills stages for a job that has none', async () => {
		const bare = await createJobFixture(`${SUITE}-bare`);

		expect(await listStages(bare.jobId)).toHaveLength(0);
		const stages = await ensureStages(bare.jobId, bare.organizationId);
		expect(stages.length).toBeGreaterThan(1);

		await bare.cleanup();
	});

	it('reports every card on the board in one pass', async () => {
		const cards = await board(jobId, organizationId);

		expect(cards.length).toBeGreaterThan(0);
		for (const card of cards) {
			expect(card.candidateEmail).toContain('@');
			// Coerced at the service boundary — a raw `sql` fragment hands back a
			// string, and a string masquerading as a Date breaks the "waiting 6 days"
			// arithmetic silently.
			expect(card.stageEnteredAt).toBeInstanceOf(Date);
		}
	});
});
