import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { applications } from '../db/schema/application';
import {
	scorecardCriteria,
	scorecardRatings,
	scorecards,
	type ScorecardCriterion
} from '../db/schema/ats';
import { users } from '../db/schema/identity';

/**
 * Interview scorecards.
 *
 * One rule shapes every function here: **nobody reads another interviewer's
 * scorecard until they have submitted their own.** A panel that sees the first
 * opinion before forming the second is not four assessments — it is one
 * assessment and three agreements. Anchoring is the cheapest damage an interview
 * process can do to itself, and it is trivially prevented by controlling when the
 * scores become visible.
 *
 * The consequences run through the rest of the design:
 *
 *   - A scorecard is a **draft** until `submittedAt`, and submitting is one-way.
 *     Editing a score after reading the room is the same failure a few minutes
 *     later.
 *   - Ratings are **1–4**, deliberately even. An odd scale lets a panel park on
 *     the middle and never decide.
 *   - The read function takes the *viewer* and decides what they may see. There is
 *     no "get all scorecards" that a caller could reach for by accident.
 */

/** The rating scale, stated once. Changing it is a product decision, not a tweak. */
export const RATING_MIN = 1;
export const RATING_MAX = 4;

/** What a job asks interviewers to assess, when nobody has said otherwise. */
const DEFAULT_CRITERIA: readonly { name: string; description: string }[] = [
	{
		name: 'Does the work',
		description: 'Can they do the job as it is actually done here, today?'
	},
	{
		name: 'Thinks it through',
		description: 'How do they reason when the answer is not already known to them?'
	},
	{
		name: 'Works with people',
		description: 'What would it be like to disagree with them about something that matters?'
	}
];

export interface ScorecardRatingView {
	criterionId: string;
	rating: number;
	comment: string | null;
}

export interface ScorecardView {
	id: string;
	interviewer: { id: string; name: string };
	overall: number | null;
	summary: string | null;
	submittedAt: Date | null;
	ratings: ScorecardRatingView[];
}

export interface ScorecardPanel {
	criteria: ScorecardCriterion[];
	/** The viewer's own, draft or submitted. Null until they start one. */
	mine: ScorecardView | null;
	/**
	 * Everyone else's — **empty until the viewer submits**. The count is still
	 * given, so the page can say "two others have scored" without saying what.
	 */
	others: ScorecardView[];
	othersSubmittedCount: number;
	/** Why `others` is empty, so the page can explain rather than look broken. */
	hiddenUntilYouSubmit: boolean;
}

async function assertOwned(applicationId: string, organizationId: string): Promise<string> {
	const [row] = await db
		.select({ jobId: applications.jobId })
		.from(applications)
		.where(and(eq(applications.id, applicationId), eq(applications.organizationId, organizationId)))
		.limit(1);

	// `not_found` rather than `forbidden`: confirming an application exists tells
	// the asker that a named person applied somewhere.
	if (!row) error(404, 'Not found.');
	return row.jobId;
}

export async function listCriteria(jobId: string): Promise<ScorecardCriterion[]> {
	return db
		.select()
		.from(scorecardCriteria)
		.where(eq(scorecardCriteria.jobId, jobId))
		.orderBy(asc(scorecardCriteria.position));
}

/**
 * A job's criteria, creating the defaults if it has none.
 *
 * Backfilled on first use rather than at job creation: most jobs never get an
 * interview, and writing three rows for each of them is work nobody asked for.
 */
export async function ensureCriteria(jobId: string): Promise<ScorecardCriterion[]> {
	const existing = await listCriteria(jobId);
	if (existing.length > 0) return existing;

	await db.insert(scorecardCriteria).values(
		DEFAULT_CRITERIA.map((criterion, index) => ({
			jobId,
			name: criterion.name,
			description: criterion.description,
			position: (index + 1) * 100
		}))
	);

	return listCriteria(jobId);
}

/**
 * Attach ratings and interviewer names to a set of scorecard rows.
 *
 * Two queries for any number of scorecards, not two per scorecard: a panel of six
 * is otherwise twelve round trips to draw one table.
 */
async function hydrate(rows: (typeof scorecards.$inferSelect)[]): Promise<ScorecardView[]> {
	if (rows.length === 0) return [];

	const [ratings, interviewers] = await Promise.all([
		db
			.select()
			.from(scorecardRatings)
			.where(
				inArray(
					scorecardRatings.scorecardId,
					rows.map((row) => row.id)
				)
			),
		db
			.select({ id: users.id, name: users.name })
			.from(users)
			.where(
				// Scoped to the people who actually scored. Selecting the whole table and
				// filtering in memory is a data leak waiting for someone to log it.
				inArray(
					users.id,
					rows.map((row) => row.interviewerUserId)
				)
			)
	]);

	const byInterviewer = new Map(interviewers.map((row) => [row.id, row.name]));

	return rows.map((row) => ({
		id: row.id,
		interviewer: {
			id: row.interviewerUserId,
			name: byInterviewer.get(row.interviewerUserId) ?? 'Someone who has left'
		},
		overall: row.overall,
		summary: row.summary,
		submittedAt: row.submittedAt,
		ratings: ratings
			.filter((rating) => rating.scorecardId === row.id)
			.map((rating) => ({
				criterionId: rating.criterionId,
				rating: rating.rating,
				comment: rating.comment
			}))
	}));
}

/**
 * The panel, as this viewer is allowed to see it.
 *
 * The viewer is a parameter rather than something the caller filters afterwards.
 * A "fetch everything then hide some" shape is one forgotten filter away from
 * showing an interviewer the scores they were meant to form an opinion without.
 */
export async function panelFor(
	applicationId: string,
	organizationId: string,
	viewerUserId: string
): Promise<ScorecardPanel> {
	const jobId = await assertOwned(applicationId, organizationId);

	const [criteria, all] = await Promise.all([
		ensureCriteria(jobId),
		db.select().from(scorecards).where(eq(scorecards.applicationId, applicationId))
	]);

	const mineRow = all.find((row) => row.interviewerUserId === viewerUserId) ?? null;
	const otherRows = all.filter(
		(row) => row.interviewerUserId !== viewerUserId && row.submittedAt !== null
	);

	const hasSubmitted = Boolean(mineRow?.submittedAt);

	const [mine, others] = await Promise.all([
		mineRow ? hydrate([mineRow]).then((views) => views[0]) : Promise.resolve(null),
		hasSubmitted ? hydrate(otherRows) : Promise.resolve([])
	]);

	return {
		criteria,
		mine,
		others,
		// The count is safe to show either way: knowing two colleagues have scored
		// tells you nothing about what they said, and hiding it makes the page look
		// like it has lost data.
		othersSubmittedCount: otherRows.length,
		hiddenUntilYouSubmit: !hasSubmitted && otherRows.length > 0
	};
}

export interface SaveScorecardInput {
	applicationId: string;
	organizationId: string;
	interviewerUserId: string;
	overall?: number | null;
	summary?: string | null;
	ratings?: { criterionId: string; rating: number; comment?: string | null }[];
	/** One-way. A submitted scorecard cannot be edited again. */
	submit?: boolean;
}

export async function save(input: SaveScorecardInput): Promise<{ submitted: boolean }> {
	const jobId = await assertOwned(input.applicationId, input.organizationId);

	const [existing] = await db
		.select()
		.from(scorecards)
		.where(
			and(
				eq(scorecards.applicationId, input.applicationId),
				eq(scorecards.interviewerUserId, input.interviewerUserId)
			)
		)
		.limit(1);

	// The rule that makes the whole feature work. Without it, an interviewer reads
	// the panel and quietly revises — which is anchoring with extra steps.
	if (existing?.submittedAt) {
		error(400, 'You have already submitted this scorecard. It cannot be changed.');
	}

	if (input.overall != null && (input.overall < RATING_MIN || input.overall > RATING_MAX)) {
		error(400, `An overall score must be between ${RATING_MIN} and ${RATING_MAX}.`);
	}

	// Submitting demands a decision. A blank scorecard marked complete is worse
	// than no scorecard, because it looks like an opinion.
	if (input.submit && input.overall == null) {
		error(400, 'Give an overall score before submitting.');
	}

	const criteria = await listCriteria(jobId);
	const known = new Set(criteria.map((criterion) => criterion.id));

	for (const rating of input.ratings ?? []) {
		if (!known.has(rating.criterionId)) error(400, 'That is not a criterion for this job.');
		if (rating.rating < RATING_MIN || rating.rating > RATING_MAX) {
			error(400, `Ratings run from ${RATING_MIN} to ${RATING_MAX}.`);
		}
	}

	await db.transaction(async (tx) => {
		const [row] = existing
			? await tx
					.update(scorecards)
					.set({
						overall: input.overall ?? existing.overall,
						summary: input.summary ?? existing.summary,
						submittedAt: input.submit ? new Date() : null
					})
					.where(eq(scorecards.id, existing.id))
					.returning()
			: await tx
					.insert(scorecards)
					.values({
						applicationId: input.applicationId,
						interviewerUserId: input.interviewerUserId,
						overall: input.overall ?? null,
						summary: input.summary ?? null,
						submittedAt: input.submit ? new Date() : null
					})
					.returning();

		for (const rating of input.ratings ?? []) {
			await tx
				.insert(scorecardRatings)
				.values({
					scorecardId: row.id,
					criterionId: rating.criterionId,
					rating: rating.rating,
					comment: rating.comment ?? null
				})
				.onConflictDoUpdate({
					target: [scorecardRatings.scorecardId, scorecardRatings.criterionId],
					set: { rating: rating.rating, comment: rating.comment ?? null }
				});
		}
	});

	return { submitted: Boolean(input.submit) };
}

/** How many submitted scorecards an application has — for the board and lists. */
export async function submittedCount(applicationId: string): Promise<number> {
	const rows = await db
		.select({ id: scorecards.id })
		.from(scorecards)
		.where(and(eq(scorecards.applicationId, applicationId), isNotNull(scorecards.submittedAt)));

	return rows.length;
}
