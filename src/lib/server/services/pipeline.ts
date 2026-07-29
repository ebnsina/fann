import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import {
	jobStages,
	pipelineTemplateStages,
	pipelineTemplates,
	stageTransitions,
	type JobStage,
	type StageKind
} from '../db/schema/ats';
import { applicationEvents, applications, type ApplicationStatus } from '../db/schema/application';
import { users } from '../db/schema/identity';
import { jobs } from '../db/schema/job';
import { notifyApplicationStatusChanged } from '../notifications';
import { companies } from '../db/schema/company';

/**
 * Hiring stages and the board.
 *
 * The board is the employer's view of a promise made to the candidate, so two
 * things hold here that are not negotiable:
 *
 *   1. **Moving someone writes history.** Every move appends a `stage_transitions`
 *      row and an `application_events` row. The column a card sits in is a cache;
 *      the transitions are the record, and they are what make "how long does this
 *      company leave people in screening" answerable later.
 *   2. **A stage carries a status.** A company can name a column anything, but the
 *      *kind* decides what the candidate is told and whether the response clock
 *      stops. Dropping a card into a column called "Not for us" has to reject the
 *      application, not just move a card, or the board and the candidate's
 *      dashboard start telling different stories.
 */

/** The stages a job gets when nobody has said otherwise. */
const DEFAULT_STAGES: readonly { name: string; kind: StageKind }[] = [
	{ name: 'Applied', kind: 'applied' },
	{ name: 'Screening', kind: 'screening' },
	{ name: 'Interview', kind: 'interview' },
	{ name: 'Offer', kind: 'offer' },
	{ name: 'Hired', kind: 'hired' },
	{ name: 'Not moving forward', kind: 'rejected' }
];

/**
 * What dropping a card into each kind of column means for the application.
 *
 * `applied` maps to `submitted` — moving someone *back* to the first column does
 * not un-respond to them, because `firstRespondedAt` is stamped once and never
 * cleared. That is deliberate: a company cannot reset its own response time by
 * dragging a card backwards.
 */
const STATUS_FOR_KIND: Record<StageKind, ApplicationStatus> = {
	applied: 'submitted',
	screening: 'in_review',
	interview: 'interviewing',
	offer: 'offered',
	hired: 'hired',
	rejected: 'rejected'
};

/** Statuses that mean the employer has engaged, so the response clock stops. */
const RESPONSE_STATUSES = new Set<ApplicationStatus>([
	'in_review',
	'interviewing',
	'offered',
	'hired',
	'rejected'
]);

/** Positions are spaced so a stage can be inserted between two without a rewrite. */
const POSITION_STEP = 100;

/**
 * Create a job's stages, copying the org's default template if it has one.
 *
 * Called when a job is created. Copies rather than references: a template edited
 * six months later must not silently redefine the columns of a job with people
 * already sitting in them.
 */
export async function createStagesForJob(jobId: string, organizationId: string): Promise<void> {
	const template = await db
		.select({ id: pipelineTemplates.id })
		.from(pipelineTemplates)
		.where(
			and(
				eq(pipelineTemplates.organizationId, organizationId),
				eq(pipelineTemplates.isDefault, true)
			)
		)
		.limit(1);

	const source = template[0]
		? await db
				.select({ name: pipelineTemplateStages.name, kind: pipelineTemplateStages.kind })
				.from(pipelineTemplateStages)
				.where(eq(pipelineTemplateStages.templateId, template[0].id))
				.orderBy(asc(pipelineTemplateStages.position))
		: DEFAULT_STAGES;

	const stages = source.length > 0 ? source : DEFAULT_STAGES;

	await db.insert(jobStages).values(
		stages.map((stage, index) => ({
			jobId,
			name: stage.name,
			kind: stage.kind,
			position: (index + 1) * POSITION_STEP
		}))
	);
}

/** A job's stages, left to right. */
export async function listStages(jobId: string): Promise<JobStage[]> {
	return db
		.select()
		.from(jobStages)
		.where(eq(jobStages.jobId, jobId))
		.orderBy(asc(jobStages.position));
}

/**
 * Stages for a job, creating the defaults if it has none.
 *
 * Jobs posted before stages existed have no columns at all, and a board with no
 * columns is a broken page rather than an empty one. This backfills on first view
 * instead of requiring a migration to guess at every existing job's process.
 */
export async function ensureStages(jobId: string, organizationId: string): Promise<JobStage[]> {
	const existing = await listStages(jobId);
	if (existing.length > 0) return existing;

	await createStagesForJob(jobId, organizationId);
	return listStages(jobId);
}

export interface BoardCard {
	id: string;
	stageId: string | null;
	status: ApplicationStatus;
	candidateName: string;
	candidateEmail: string;
	createdAt: Date;
	firstRespondedAt: Date | null;
	resumeDocumentId: string | null;
	/** When this card last moved, for the "waiting 6 days" label on the column. */
	stageEnteredAt: Date;
}

/**
 * Every application on a job, with what the board needs to draw a card.
 *
 * One query rather than one per column: a board with six columns would otherwise
 * be six round trips that have to agree with each other, and they will not once
 * somebody moves a card while the page is loading.
 */
export async function board(jobId: string, organizationId: string): Promise<BoardCard[]> {
	const rows = await db
		.select({
			id: applications.id,
			stageId: applications.currentStageId,
			status: applications.status,
			candidateName: users.name,
			candidateEmail: users.email,
			createdAt: applications.createdAt,
			firstRespondedAt: applications.firstRespondedAt,
			resumeDocumentId: applications.resumeDocumentId,
			// The last time this application moved, falling back to when it arrived.
			// Computed in SQL so "waiting 6 days" cannot drift with the app server's
			// clock, and so it is one query rather than one per card.
			stageEnteredAt: sql<Date>`coalesce(
				(
					select max(${stageTransitions.createdAt})
					from ${stageTransitions}
					where ${stageTransitions.applicationId} = ${applications.id}
				),
				${applications.createdAt}
			)`.as('stage_entered_at')
		})
		.from(applications)
		.innerJoin(users, eq(users.id, applications.userId))
		.where(and(eq(applications.jobId, jobId), eq(applications.organizationId, organizationId)))
		.orderBy(asc(applications.createdAt));

	// `db.select` with a raw `sql` fragment returns whatever the driver gives us,
	// which for a timestamp is a string. Coerce at the boundary rather than letting
	// a string masquerade as a Date through the rest of the app.
	return rows.map((row) => ({
		...row,
		stageEnteredAt: new Date(row.stageEnteredAt)
	}));
}

export interface MoveInput {
	applicationId: string;
	toStageId: string;
	organizationId: string;
	actorUserId: string;
	/** Shown to the candidate when the target column rejects. */
	reason?: string | null;
	/** Base URL for links in the email. Omit to skip notifying. */
	origin?: string;
}

/**
 * Move one application to a stage.
 *
 * The single write path for the board. Everything it does happens in one
 * transaction, because a card that has moved without a matching history row is
 * exactly the state that makes the timeline untrustworthy.
 */
export async function moveToStage(input: MoveInput): Promise<{ status: ApplicationStatus }> {
	const [current] = await db
		.select({
			id: applications.id,
			jobId: applications.jobId,
			status: applications.status,
			currentStageId: applications.currentStageId,
			firstRespondedAt: applications.firstRespondedAt,
			rejectedAt: applications.rejectedAt,
			rejectionReason: applications.rejectionReason
		})
		.from(applications)
		.where(
			and(
				eq(applications.id, input.applicationId),
				eq(applications.organizationId, input.organizationId)
			)
		)
		.limit(1);

	if (!current) error(404, 'Not found.');

	// A candidate who withdrew is out of the employer's hands. Leaving them
	// draggable would let a company quietly "advance" someone who has left.
	if (current.status === 'withdrawn') {
		error(400, 'This candidate withdrew their application.');
	}

	const [stage] = await db
		.select()
		.from(jobStages)
		.where(and(eq(jobStages.id, input.toStageId), eq(jobStages.jobId, current.jobId)))
		.limit(1);

	// Scoped to the job, not just to the org: without that, a stage id from another
	// job in the same company would be accepted and the card would vanish from
	// every board.
	if (!stage) error(404, 'That stage does not belong to this job.');

	if (stage.id === current.currentStageId) return { status: current.status };

	const status = STATUS_FOR_KIND[stage.kind];

	// Rejecting requires a reason. This is the same rule the reject button enforces;
	// it lives here so dragging a card into the rejected column cannot route around
	// it. See `application.ts` for the other half of the promise.
	const reason = input.reason?.trim() || null;
	if (stage.kind === 'rejected' && !reason && !current.rejectionReason) {
		error(400, 'Tell the candidate why before moving them here.');
	}

	const now = new Date();

	await db.transaction(async (tx) => {
		await tx
			.update(applications)
			.set({
				currentStageId: stage.id,
				status,
				// Stamped once, never cleared. A company that replies fast and then goes
				// quiet must not be able to re-earn a good response time by moving a card
				// back to the first column and forward again.
				firstRespondedAt: current.firstRespondedAt ?? (RESPONSE_STATUSES.has(status) ? now : null),
				rejectedAt: status === 'rejected' ? (current.rejectedAt ?? now) : null,
				rejectionReason: status === 'rejected' ? (reason ?? current.rejectionReason) : null
			})
			.where(eq(applications.id, input.applicationId));

		await tx.insert(stageTransitions).values({
			applicationId: input.applicationId,
			fromStageId: current.currentStageId,
			toStageId: stage.id,
			actorUserId: input.actorUserId,
			note: reason
		});

		await tx.insert(applicationEvents).values({
			applicationId: input.applicationId,
			type: 'status_changed',
			actorUserId: input.actorUserId,
			// The candidate sees where they stand. That is the product, and it is why
			// the board cannot be a private scratchpad.
			visibleToCandidate: true,
			payload: { from: current.status, to: status, stage: stage.name, reason }
		});
	});

	// After the commit. A mail outage must not roll back a decision the employer has
	// already made; `deliver` records the failure instead of throwing.
	if (input.origin && status !== current.status) {
		await notifyMove(input.applicationId, status, reason, input.origin);
	}

	return { status };
}

/** Gather the recipient and job details a status email needs, then send it. */
async function notifyMove(
	applicationId: string,
	status: ApplicationStatus,
	reason: string | null,
	origin: string
): Promise<void> {
	const [context] = await db
		.select({
			userId: users.id,
			name: users.name,
			email: users.email,
			jobTitle: jobs.title,
			jobSlug: jobs.slug,
			companyName: companies.name
		})
		.from(applications)
		.innerJoin(users, eq(users.id, applications.userId))
		.innerJoin(jobs, eq(jobs.id, applications.jobId))
		.innerJoin(companies, eq(companies.id, jobs.companyId))
		.where(eq(applications.id, applicationId))
		.limit(1);

	if (!context) return;

	await notifyApplicationStatusChanged(
		{ userId: context.userId, name: context.name, email: context.email },
		{
			applicationId,
			jobTitle: context.jobTitle,
			jobSlug: context.jobSlug,
			companyName: context.companyName,
			origin,
			status,
			reason
		}
	);
}

/**
 * Move several applications to the same stage.
 *
 * Each one goes through `moveToStage` rather than a single bulk `UPDATE`, so a
 * batch cannot bypass the rules a single move obeys: the rejection reason, the
 * response clock, the transition row, the candidate's event, the email. A faster
 * query that skips those would make "select all → reject" the one path in the
 * product that rejects people silently.
 *
 * Failures are collected rather than thrown. One withdrawn candidate in a
 * selection of thirty should not abandon the other twenty-nine halfway through,
 * and the caller is told exactly which ones did not move.
 */
export async function moveManyToStage(
	applicationIds: string[],
	input: Omit<MoveInput, 'applicationId'>
): Promise<{ moved: string[]; failed: { applicationId: string; reason: string }[] }> {
	const moved: string[] = [];
	const failed: { applicationId: string; reason: string }[] = [];

	for (const applicationId of applicationIds) {
		try {
			await moveToStage({ ...input, applicationId });
			moved.push(applicationId);
		} catch (cause) {
			failed.push({
				applicationId,
				reason: cause instanceof Error ? cause.message : 'That move did not go through.'
			});
		}
	}

	return { moved, failed };
}

/* ---------------------------------------------------------------------------
   Editing the columns themselves
   --------------------------------------------------------------------------- */

export async function addStage(jobId: string, name: string, kind: StageKind): Promise<JobStage> {
	const stages = await listStages(jobId);
	const last = stages.at(-1);

	const [row] = await db
		.insert(jobStages)
		.values({
			jobId,
			name,
			kind,
			position: (last?.position ?? 0) + POSITION_STEP
		})
		.returning();

	return row;
}

export async function renameStage(stageId: string, jobId: string, name: string): Promise<void> {
	await db
		.update(jobStages)
		.set({ name })
		.where(and(eq(jobStages.id, stageId), eq(jobStages.jobId, jobId)));
}

/**
 * Delete a stage, moving anyone standing in it to the stage before.
 *
 * Never leaves cards nowhere. The foreign key would null their `currentStageId`
 * and they would silently reappear in the first column, which looks like the
 * product losing track of people — because it is.
 */
export async function deleteStage(stageId: string, jobId: string): Promise<void> {
	const stages = await listStages(jobId);
	if (stages.length <= 1) error(400, 'A job needs at least one stage.');

	const index = stages.findIndex((stage) => stage.id === stageId);
	if (index === -1) error(404, 'Not found.');

	// The one before, or the one after if this was the first.
	const fallback = stages[index - 1] ?? stages[index + 1];

	await db.transaction(async (tx) => {
		await tx
			.update(applications)
			.set({ currentStageId: fallback.id })
			.where(eq(applications.currentStageId, stageId));

		await tx.delete(jobStages).where(and(eq(jobStages.id, stageId), eq(jobStages.jobId, jobId)));
	});
}

/**
 * Rewrite the column order from a list of stage ids.
 *
 * Done as a delete-free two-pass update: positions are first pushed into a range
 * nothing else occupies, then written to their final values. A single pass would
 * trip the `(job_id, position)` unique index the moment two stages swapped.
 */
export async function reorderStages(jobId: string, orderedIds: string[]): Promise<void> {
	const stages = await listStages(jobId);
	const known = new Set(stages.map((stage) => stage.id));

	if (orderedIds.length !== stages.length || orderedIds.some((id) => !known.has(id))) {
		error(400, 'That is not the full set of stages for this job.');
	}

	await db.transaction(async (tx) => {
		// Somewhere no real position can be, so the second pass cannot collide.
		const offset = (stages.length + 1) * POSITION_STEP * 10;

		await tx
			.update(jobStages)
			.set({ position: sql`${jobStages.position} + ${offset}` })
			.where(inArray(jobStages.id, orderedIds));

		for (const [index, id] of orderedIds.entries()) {
			await tx
				.update(jobStages)
				.set({ position: (index + 1) * POSITION_STEP })
				.where(eq(jobStages.id, id));
		}
	});
}
