import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { applicationEvents, applications } from '../db/schema/application';
import { offers, type Offer, type OfferStatus } from '../db/schema/ats';
import { companies } from '../db/schema/company';
import { users } from '../db/schema/identity';
import { jobs } from '../db/schema/job';
import { deliver } from '../notifications';
import { formatSalaryRange } from '#lib/utils/format';

/**
 * Offers of employment.
 *
 * The last place this product's argument has to hold. A job listing states its
 * pay; an offer that arrives without a number, or with a deadline nobody
 * mentioned, undoes all of that at the final step — which is exactly where it
 * hurts most, because by then the candidate has spent weeks.
 *
 * So: the salary is not nullable, sending is explicit and separate from drafting,
 * and the candidate is emailed the actual figure rather than "we would like to
 * discuss compensation".
 */

/** What may follow what. Anything not listed is refused rather than merely unlikely. */
const TRANSITIONS: Record<OfferStatus, readonly OfferStatus[]> = {
	draft: ['sent', 'withdrawn'],
	sent: ['accepted', 'declined', 'withdrawn', 'expired'],
	accepted: [],
	declined: [],
	withdrawn: [],
	expired: []
};

/**
 * What the *candidate* may do, which is a much shorter list.
 *
 * Accepting and declining are theirs alone; withdrawing and expiring belong to
 * the employer and the clock. Kept as its own table rather than as an `if` inside
 * the transition check, so widening what a candidate may do is a visible edit to
 * a named thing.
 */
const CANDIDATE_TRANSITIONS: Record<OfferStatus, readonly OfferStatus[]> = {
	draft: [],
	sent: ['accepted', 'declined'],
	accepted: [],
	declined: [],
	withdrawn: [],
	expired: []
};

async function assertOwned(applicationId: string, organizationId: string): Promise<void> {
	const [row] = await db
		.select({ id: applications.id })
		.from(applications)
		.where(and(eq(applications.id, applicationId), eq(applications.organizationId, organizationId)))
		.limit(1);

	if (!row) error(404, 'Not found.');
}

export async function listForApplication(
	applicationId: string,
	organizationId: string
): Promise<Offer[]> {
	await assertOwned(applicationId, organizationId);

	return db
		.select()
		.from(offers)
		.where(eq(offers.applicationId, applicationId))
		.orderBy(desc(offers.createdAt));
}

export interface DraftOfferInput {
	applicationId: string;
	organizationId: string;
	actorUserId: string;
	salaryAmount: number;
	salaryCurrency?: string;
	salaryPeriod?: string;
	extras?: string | null;
	startDate?: Date | null;
	expiresAt?: Date | null;
}

export async function draft(input: DraftOfferInput): Promise<Offer> {
	await assertOwned(input.applicationId, input.organizationId);

	if (input.salaryAmount <= 0) error(400, 'An offer needs a salary.');

	// A deadline in the past is not a deadline, it is an offer that arrives expired.
	if (input.expiresAt && input.expiresAt.getTime() < Date.now()) {
		error(400, 'That expiry date has already passed.');
	}

	const [row] = await db
		.insert(offers)
		.values({
			applicationId: input.applicationId,
			salaryAmount: input.salaryAmount,
			salaryCurrency: input.salaryCurrency ?? 'USD',
			salaryPeriod: input.salaryPeriod ?? 'year',
			extras: input.extras ?? null,
			startDate: input.startDate ?? null,
			expiresAt: input.expiresAt ?? null,
			createdByUserId: input.actorUserId
		})
		.returning();

	// No event and no email: a draft is a thought, and telling a candidate about a
	// thought is how "we are putting together an offer" becomes a promise.
	return row;
}

/**
 * Move an offer along.
 *
 * Sending is what the candidate is told about, and it is a separate, deliberate
 * act from writing one — a draft that emailed itself would make every typo a
 * negotiation.
 */
export async function changeStatus(
	offerId: string,
	applicationId: string,
	organizationId: string,
	actorUserId: string,
	to: OfferStatus,
	origin?: string
): Promise<Offer> {
	await assertOwned(applicationId, organizationId);

	const [current] = await db
		.select()
		.from(offers)
		.where(and(eq(offers.id, offerId), eq(offers.applicationId, applicationId)))
		.limit(1);

	if (!current) error(404, 'Not found.');

	if (!TRANSITIONS[current.status].includes(to)) {
		error(400, `An offer that is ${current.status} cannot become ${to}.`);
	}

	const updated = await applyTransition(current, applicationId, actorUserId, to);

	if (origin && to === 'sent') await notifyOffer(updated, applicationId, origin);
	return updated;
}

/**
 * The write half of a status change, shared by the employer and the candidate.
 *
 * Deliberately one function. "Accepting an offer" also means marking the
 * application hired and writing the event, and two copies of that would be two
 * definitions of getting the job — the board and the offer would eventually
 * disagree about whether somebody has one.
 */
async function applyTransition(
	current: Offer,
	applicationId: string,
	/** Null when the clock did it rather than a person — see `expireOverdue`. */
	actorUserId: string | null,
	to: OfferStatus
): Promise<Offer> {
	const now = new Date();

	return db.transaction(async (tx) => {
		const [row] = await tx
			.update(offers)
			.set({
				status: to,
				sentAt: to === 'sent' ? now : current.sentAt,
				decidedAt: ['accepted', 'declined', 'withdrawn', 'expired'].includes(to)
					? now
					: current.decidedAt
			})
			.where(eq(offers.id, current.id))
			.returning();

		// Accepting an offer is the moment a hire happens. Leaving the application
		// behind in "offered" would mean the board and the offer disagree about
		// whether someone got the job.
		if (to === 'accepted') {
			await tx
				.update(applications)
				.set({ status: 'hired' })
				.where(eq(applications.id, applicationId));
		}

		await tx.insert(applicationEvents).values({
			applicationId,
			type: 'status_changed',
			actorUserId,
			// Everything except a withdrawn draft is the candidate's business.
			visibleToCandidate: to !== 'withdrawn' || current.status !== 'draft',
			payload: { offer: to, amount: row.salaryAmount, currency: row.salaryCurrency }
		});

		return row;
	});
}

/**
 * Every live offer belonging to one candidate, keyed by application.
 *
 * Scoped by `userId` in the query rather than filtered afterwards: a
 * fetch-then-check shape is one forgotten line away from showing somebody another
 * person's salary. Drafts are excluded by the `sentAt` requirement — an offer
 * nobody has sent is not an offer, and surfacing one would leak the employer's
 * thinking mid-negotiation.
 *
 * One query for the whole applications list rather than one per row, and only the
 * newest sent offer per application: a re-issued offer supersedes the one before
 * it, and showing both would ask somebody to decide twice.
 */
export async function sentForCandidate(userId: string) {
	const rows = await db
		.selectDistinctOn([offers.applicationId], {
			applicationId: offers.applicationId,
			id: offers.id,
			salaryAmount: offers.salaryAmount,
			salaryCurrency: offers.salaryCurrency,
			salaryPeriod: offers.salaryPeriod,
			extras: offers.extras,
			startDate: offers.startDate,
			expiresAt: offers.expiresAt,
			status: offers.status,
			decidedAt: offers.decidedAt,
			// Computed here rather than against the browser's clock, which a candidate
			// can set to anything and which drifts from the database regardless. An
			// offer with no deadline never lapses, hence the coalesce.
			lapsed: sql<boolean>`coalesce(${offers.expiresAt} < now(), false)`
		})
		.from(offers)
		.innerJoin(applications, eq(applications.id, offers.applicationId))
		.where(and(eq(applications.userId, userId), sql`${offers.sentAt} is not null`))
		.orderBy(offers.applicationId, desc(offers.createdAt));

	return rows;
}

export type CandidateOffer = Awaited<ReturnType<typeof sentForCandidate>>[number];

/**
 * The candidate accepts or declines their own offer.
 *
 * This exists because the employer-side `changeStatus` cannot serve it: it takes
 * an `organizationId` and asserts against it, so without this the employer would
 * be clicking "accepted" on the candidate's behalf — recording a decision as
 * though the person made it. On a product whose whole argument is that the
 * candidate is a party to this rather than a subject of it, that is the wrong way
 * round.
 */
export async function respondAsCandidate(
	offerId: string,
	userId: string,
	to: OfferStatus,
	origin?: string
): Promise<Offer> {
	const [found] = await db
		.select({ offer: offers, applicationId: applications.id })
		.from(offers)
		.innerJoin(applications, eq(applications.id, offers.applicationId))
		.where(and(eq(offers.id, offerId), eq(applications.userId, userId)))
		.limit(1);

	// Not "forbidden": telling a stranger that an offer with this id exists is
	// itself a leak, the same reasoning as `resolveForViewer`.
	if (!found) error(404, 'Not found.');

	if (!CANDIDATE_TRANSITIONS[found.offer.status].includes(to)) {
		error(400, `This offer can no longer be ${to}.`);
	}

	// `expireOverdue` runs on a schedule, so between the deadline passing and the
	// job running an offer is stale rather than expired. Accepting one in that
	// window would let a candidate take an offer the employer considers closed.
	if (found.offer.expiresAt && found.offer.expiresAt.getTime() < Date.now()) {
		error(400, 'That offer has expired.');
	}

	const updated = await applyTransition(found.offer, found.applicationId, userId, to);

	if (origin) await notifyDecision(updated, found.applicationId, to, origin);
	return updated;
}

/**
 * Tell the employer what the candidate decided.
 *
 * Sent to whoever wrote the offer. A decision that only appeared on a board
 * somebody has to remember to open is how a hire sits unnoticed for a week.
 */
async function notifyDecision(
	offer: Offer,
	applicationId: string,
	to: OfferStatus,
	origin: string
): Promise<void> {
	if (!offer.createdByUserId) return;

	// Both the writer of the offer and the candidate are rows in `users`, so one of
	// them needs an alias — a bare second join would be ambiguous.
	const candidate = alias(users, 'candidate');

	const [context] = await db
		.select({
			userId: users.id,
			name: users.name,
			email: users.email,
			candidateName: candidate.name,
			jobTitle: jobs.title,
			organizationId: applications.organizationId,
			jobId: applications.jobId
		})
		.from(applications)
		.innerJoin(jobs, eq(jobs.id, applications.jobId))
		.innerJoin(users, eq(users.id, offer.createdByUserId))
		.innerJoin(candidate, eq(candidate.id, applications.userId))
		.where(eq(applications.id, applicationId))
		.limit(1);

	if (!context) return;

	const verb = to === 'accepted' ? 'accepted' : 'declined';

	await deliver({
		to: { email: context.email, name: context.name },
		userId: context.userId,
		entityType: 'offer',
		entityId: offer.id,
		tag: `offer.${verb}`,
		subject: `${context.candidateName} ${verb} your offer for ${context.jobTitle}`,
		text: [
			`Hi ${context.name},`,
			'',
			`${context.candidateName} has ${verb} the offer for ${context.jobTitle}.`,
			'',
			`${origin}/hire/${context.organizationId}/jobs/${context.jobId}/applicants`
		].join('\n')
	});
}

/** The email that carries the actual number. */
async function notifyOffer(offer: Offer, applicationId: string, origin: string): Promise<void> {
	const [context] = await db
		.select({
			userId: users.id,
			name: users.name,
			email: users.email,
			jobTitle: jobs.title,
			companyName: companies.name
		})
		.from(applications)
		.innerJoin(users, eq(users.id, applications.userId))
		.innerJoin(jobs, eq(jobs.id, applications.jobId))
		.innerJoin(companies, eq(companies.id, jobs.companyId))
		.where(eq(applications.id, applicationId))
		.limit(1);

	if (!context) return;

	// The same formatter the listing used, so the offer reads in the units the
	// candidate has been looking at all along.
	const pay = formatSalaryRange(
		offer.salaryAmount,
		offer.salaryAmount,
		offer.salaryCurrency,
		offer.salaryPeriod
	);

	await deliver({
		to: { email: context.email, name: context.name },
		userId: context.userId,
		entityType: 'offer',
		entityId: offer.id,
		tag: 'offer.sent',
		origin,
		notify: {
			category: 'offer',
			title: `You have an offer — ${context.jobTitle}`,
			body: context.companyName,
			url: '/me/applications'
		},
		subject: `An offer from ${context.companyName} for ${context.jobTitle}`,
		text: [
			`Hi ${context.name},`,
			'',
			`${context.companyName} has made you an offer for the ${context.jobTitle} role.`,
			'',
			`Salary: ${pay}`,
			offer.extras ? `Also: ${offer.extras}` : '',
			offer.startDate ? `Starting: ${offer.startDate.toDateString()}` : '',
			offer.expiresAt ? `Please reply by: ${offer.expiresAt.toDateString()}` : '',
			'',
			`See it on your applications page: ${origin}/me/applications`
		]
			.filter(Boolean)
			.join('\n')
	});
}

/**
 * Lapse any offer whose deadline has passed.
 *
 * The comparison and the stamp both use the database's `now()`, so the decision
 * and the record of it sit on one clock. Passing a JS `Date` here would make
 * "expired at 23:59" depend on which machine asked, and the two could disagree by
 * whatever the app server's drift happens to be.
 */
export async function expireOverdue(): Promise<number> {
	// Selected first, then transitioned one at a time through the same path every
	// other status change uses. A bulk `UPDATE` was faster and wrong: it skipped
	// `applyTransition`, so a lapsed offer never wrote an `application_events` row
	// and simply vanished from the candidate's timeline — the one table this
	// product treats as a promise rather than a debugging aid.
	const due = await db
		.select()
		.from(offers)
		.where(and(eq(offers.status, 'sent'), sql`${offers.expiresAt} < now()`));

	let expired = 0;

	for (const offer of due) {
		try {
			// `actorUserId` is null: nobody did this, the clock did. Attributing it to
			// whoever happens to run the job would put a name against a decision no
			// person made.
			await applyTransition(offer, offer.applicationId, null, 'expired');
			expired++;
		} catch (cause) {
			// One bad row must not strand the rest — the next run would find the same
			// offer first and stall again.
			console.error('Could not expire an offer', { offerId: offer.id, cause });
		}
	}

	return expired;
}
