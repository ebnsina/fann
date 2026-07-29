import { and, asc, desc, eq, ilike, isNull, or, gt, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import {
	applicationEvents,
	applications,
	type Application,
	type ApplicationStatus
} from '../db/schema/application';
import { candidateProfiles } from '../db/schema/candidate';
import { companies } from '../db/schema/company';
import { users } from '../db/schema/identity';
import { jobs } from '../db/schema/job';
import { notifyApplicationReceived, notifyApplicationStatusChanged } from '../notifications';
import { enqueue as enqueueWebhook } from './webhook';

/**
 * Applications.
 *
 * Two rules run through everything here. Every state change writes an immutable
 * event, because the candidate's timeline is a product promise rather than a
 * debugging aid. And the first employer response stamps `firstRespondedAt`, which
 * is what makes response-time and ghosting statistics measurable instead of
 * self-reported.
 */

/** What the candidate may do next, from their current status. */
const CANDIDATE_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
	submitted: ['withdrawn'],
	in_review: ['withdrawn'],
	interviewing: ['withdrawn'],
	offered: ['withdrawn'],
	hired: [],
	rejected: [],
	withdrawn: []
};

/** What the employer may do. Rejection is reachable from anywhere still live. */
const EMPLOYER_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
	submitted: ['in_review', 'interviewing', 'rejected'],
	in_review: ['interviewing', 'offered', 'rejected'],
	interviewing: ['offered', 'rejected'],
	offered: ['hired', 'rejected'],
	hired: [],
	rejected: [],
	// The candidate withdrew; the employer cannot pull them back in.
	withdrawn: []
};

/** Statuses that mean the employer has engaged, so the clock stops. */
const RESPONSE_STATUSES = new Set<ApplicationStatus>([
	'in_review',
	'interviewing',
	'offered',
	'hired',
	'rejected'
]);

export interface ApplyInput {
	jobId: string;
	userId: string;
	resumeDocumentId?: string | null;
	coverLetter?: string | null;
	source?: string;
	/** Base URL for links in the confirmation email. Omit to skip notifying. */
	origin?: string;
}

export async function apply(input: ApplyInput): Promise<Application> {
	// Only a live listing accepts applications — a closed job silently accepting
	// them is the most basic form of wasting someone's time.
	const [job] = await db
		.select({
			id: jobs.id,
			organizationId: jobs.organizationId,
			companyId: jobs.companyId,
			title: jobs.title,
			slug: jobs.slug
		})
		.from(jobs)
		.where(
			and(
				eq(jobs.id, input.jobId),
				eq(jobs.status, 'published'),
				isNull(jobs.deletedAt),
				or(isNull(jobs.closesAt), gt(jobs.closesAt, new Date()))
			)
		)
		.limit(1);

	if (!job) error(404, 'That job is no longer accepting applications.');

	const [existing] = await db
		.select({ id: applications.id })
		.from(applications)
		.where(and(eq(applications.jobId, input.jobId), eq(applications.userId, input.userId)))
		.limit(1);

	if (existing) error(409, 'You have already applied for this job.');

	const [profile] = await db
		.select({ id: candidateProfiles.id })
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, input.userId))
		.limit(1);

	const application = await db.transaction(async (tx) => {
		const [row] = await tx
			.insert(applications)
			.values({
				jobId: job.id,
				organizationId: job.organizationId,
				userId: input.userId,
				profileId: profile?.id ?? null,
				resumeDocumentId: input.resumeDocumentId ?? null,
				coverLetter: input.coverLetter ?? null,
				source: input.source ?? 'direct'
			})
			.returning();

		await tx.insert(applicationEvents).values({
			applicationId: row.id,
			type: 'submitted',
			actorUserId: input.userId,
			visibleToCandidate: true
		});

		// Denormalized counter, kept in the same transaction so the number on the
		// listing can never disagree with the rows behind it.
		await tx
			.update(jobs)
			.set({ applicantCount: sql`${jobs.applicantCount} + 1` })
			.where(eq(jobs.id, job.id));

		return row;
	});

	// Confirmation after commit. An email failure must not undo an application the
	// candidate has already been told was submitted.
	if (input.origin) {
		const [candidate] = await db
			.select({ userId: users.id, name: users.name, email: users.email })
			.from(users)
			.where(eq(users.id, input.userId))
			.limit(1);

		const [company] = await db
			.select({ name: companies.name })
			.from(companies)
			.where(eq(companies.id, job.companyId))
			.limit(1);

		if (candidate && company) {
			await notifyApplicationReceived(candidate, {
				applicationId: application.id,
				jobTitle: job.title,
				jobSlug: job.slug,
				companyName: company.name,
				origin: input.origin
			});
		}
	}

	// Queued, never sent from here: a stranger's endpoint being slow must not sit
	// inside the path a candidate is waiting on. `enqueue` only writes rows.
	await enqueueWebhook(job.organizationId, 'application.created', {
		applicationId: application.id,
		jobId: job.id,
		jobTitle: job.title,
		status: application.status,
		appliedAt: application.createdAt
	});

	return application;
}

export async function withdraw(applicationId: string, userId: string): Promise<void> {
	const [application] = await db
		.select()
		.from(applications)
		.where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
		.limit(1);

	if (!application) error(404, 'Not found.');
	if (!CANDIDATE_TRANSITIONS[application.status].includes('withdrawn')) {
		error(400, 'This application can no longer be withdrawn.');
	}

	await db.transaction(async (tx) => {
		await tx
			.update(applications)
			.set({ status: 'withdrawn', withdrawnAt: new Date() })
			.where(eq(applications.id, applicationId));

		await tx.insert(applicationEvents).values({
			applicationId,
			type: 'withdrawn',
			actorUserId: userId,
			visibleToCandidate: true
		});
	});
}

/**
 * Employer-side status change.
 *
 * Stamps `firstRespondedAt` the first time the employer engages. Deliberately
 * only set once — a company that replies quickly then goes quiet should not be
 * able to keep resetting its own response-time metric.
 */
export async function changeStatus(
	applicationId: string,
	organizationId: string,
	actorUserId: string,
	to: ApplicationStatus,
	reason?: string,
	/** Base URL for links in the email. Omit to skip notifying. */
	origin?: string
): Promise<Application> {
	const [current] = await db
		.select()
		.from(applications)
		.where(and(eq(applications.id, applicationId), eq(applications.organizationId, organizationId)))
		.limit(1);

	if (!current) error(404, 'Not found.');
	if (!EMPLOYER_TRANSITIONS[current.status].includes(to)) {
		error(400, `An application that is ${current.status} cannot become ${to}.`);
	}

	const updated = await db.transaction(async (tx) => {
		const [row] = await tx
			.update(applications)
			.set({
				status: to,
				firstRespondedAt:
					current.firstRespondedAt ?? (RESPONSE_STATUSES.has(to) ? new Date() : null),
				rejectedAt: to === 'rejected' ? new Date() : current.rejectedAt,
				rejectionReason: to === 'rejected' ? (reason ?? null) : current.rejectionReason
			})
			.where(eq(applications.id, applicationId))
			.returning();

		await tx.insert(applicationEvents).values({
			applicationId,
			type: 'status_changed',
			actorUserId,
			// The candidate is told where they stand. That is the product.
			visibleToCandidate: true,
			payload: { from: current.status, to, reason: reason ?? null }
		});

		return row;
	});

	// Emailed after the transaction commits, and awaited so the caller's "candidate
	// notified" is a statement about something that actually happened. `deliver`
	// never throws — a mail outage is recorded in `email_log`, not raised here,
	// because the employer's decision is already committed either way.
	if (origin) await notifyStatusChange(updated, to, reason ?? null, origin);

	await enqueueWebhook(organizationId, 'application.status_changed', {
		applicationId: updated.id,
		jobId: updated.jobId,
		from: current.status,
		to,
		reason: reason ?? null
	});

	return updated;
}

/** Gather the recipient and job details a status email needs, then send it. */
async function notifyStatusChange(
	application: Application,
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
		.where(eq(applications.id, application.id))
		.limit(1);

	if (!context) return;

	await notifyApplicationStatusChanged(
		{ userId: context.userId, name: context.name, email: context.email },
		{
			applicationId: application.id,
			jobTitle: context.jobTitle,
			jobSlug: context.jobSlug,
			companyName: context.companyName,
			origin,
			status,
			reason
		}
	);
}

/** A candidate's own applications, for their dashboard. */
export async function listForUser(userId: string) {
	return db
		.select({
			id: applications.id,
			status: applications.status,
			createdAt: applications.createdAt,
			firstRespondedAt: applications.firstRespondedAt,
			rejectionReason: applications.rejectionReason,
			jobSlug: jobs.slug,
			jobTitle: jobs.title,
			salaryMin: jobs.salaryMin,
			salaryMax: jobs.salaryMax,
			salaryCurrency: jobs.salaryCurrency,
			salaryPeriod: jobs.salaryPeriod,
			responseSlaDays: jobs.responseSlaDays,
			companyName: companies.name,
			companySlug: companies.slug
		})
		.from(applications)
		.innerJoin(jobs, eq(jobs.id, applications.jobId))
		.innerJoin(companies, eq(companies.id, jobs.companyId))
		.where(eq(applications.userId, userId))
		.orderBy(desc(applications.createdAt));
}

/** The candidate-visible timeline for one application. */
export async function timelineForCandidate(applicationId: string, userId: string) {
	const [owned] = await db
		.select({ id: applications.id })
		.from(applications)
		.where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
		.limit(1);

	if (!owned) error(404, 'Not found.');

	return db
		.select({
			id: applicationEvents.id,
			type: applicationEvents.type,
			createdAt: applicationEvents.createdAt,
			payload: applicationEvents.payload
		})
		.from(applicationEvents)
		.where(
			and(
				eq(applicationEvents.applicationId, applicationId),
				eq(applicationEvents.visibleToCandidate, true)
			)
		)
		.orderBy(applicationEvents.createdAt);
}

/** Whether this user already applied — drives the job page's apply button. */
export async function hasApplied(jobId: string, userId: string): Promise<boolean> {
	const [existing] = await db
		.select({ id: applications.id })
		.from(applications)
		.where(and(eq(applications.jobId, jobId), eq(applications.userId, userId)))
		.limit(1);

	return Boolean(existing);
}

/**
 * Applications for one job, for the employer's review list.
 *
 * Includes the applicant's name and email because the employer needs to contact
 * them — this is the data the candidate handed over for exactly that purpose, and
 * the guard on the calling remote function is what keeps it inside the org.
 */
export async function listForJob(jobId: string, organizationId: string) {
	return db
		.select({
			id: applications.id,
			status: applications.status,
			createdAt: applications.createdAt,
			firstRespondedAt: applications.firstRespondedAt,
			coverLetter: applications.coverLetter,
			resumeDocumentId: applications.resumeDocumentId,
			candidateName: users.name,
			candidateEmail: users.email
		})
		.from(applications)
		.innerJoin(users, eq(users.id, applications.userId))
		.where(and(eq(applications.jobId, jobId), eq(applications.organizationId, organizationId)))
		.orderBy(desc(applications.createdAt));
}

export interface OrgApplicantFilter {
	/** Blank means everything. Matched against name, email and job title. */
	search?: string;
	status?: ApplicationStatus;
	/** Only people nobody has replied to yet — the list this product exists for. */
	waitingOnly?: boolean;
}

/**
 * Every applicant across an organization's jobs.
 *
 * The cross-job view, as opposed to `listForJob`. Sorted oldest-first when
 * filtered to people still waiting, because in that mode the list is a queue and
 * the person at the top has been waiting longest — sorting it newest-first would
 * bury exactly the people the page exists to surface.
 */
export async function listForOrg(organizationId: string, filter: OrgApplicantFilter = {}) {
	const conditions = [eq(applications.organizationId, organizationId)];

	if (filter.status) conditions.push(eq(applications.status, filter.status));
	if (filter.waitingOnly) conditions.push(isNull(applications.firstRespondedAt));

	if (filter.search?.trim()) {
		const term = `%${filter.search.trim()}%`;
		conditions.push(
			or(ilike(users.name, term), ilike(users.email, term), ilike(jobs.title, term))!
		);
	}

	return db
		.select({
			id: applications.id,
			status: applications.status,
			createdAt: applications.createdAt,
			firstRespondedAt: applications.firstRespondedAt,
			candidateName: users.name,
			candidateEmail: users.email,
			jobId: jobs.id,
			jobTitle: jobs.title
		})
		.from(applications)
		.innerJoin(users, eq(users.id, applications.userId))
		.innerJoin(jobs, eq(jobs.id, applications.jobId))
		.where(and(...conditions))
		.orderBy(filter.waitingOnly ? asc(applications.createdAt) : desc(applications.createdAt))
		.limit(200);
}

/**
 * One application, in full, for the employer's detail view.
 *
 * Scoped to the organization in the same query rather than checked afterwards: an
 * `and()` the database enforces cannot be forgotten by a later caller the way a
 * separate guard can.
 */
export async function detailForOrg(applicationId: string, organizationId: string) {
	const [row] = await db
		.select({
			id: applications.id,
			status: applications.status,
			currentStageId: applications.currentStageId,
			createdAt: applications.createdAt,
			firstRespondedAt: applications.firstRespondedAt,
			rejectedAt: applications.rejectedAt,
			rejectionReason: applications.rejectionReason,
			withdrawnAt: applications.withdrawnAt,
			source: applications.source,
			coverLetter: applications.coverLetter,
			resumeDocumentId: applications.resumeDocumentId,
			candidateName: users.name,
			candidateEmail: users.email,
			jobId: jobs.id,
			jobTitle: jobs.title,
			jobSlug: jobs.slug
		})
		.from(applications)
		.innerJoin(users, eq(users.id, applications.userId))
		.innerJoin(jobs, eq(jobs.id, applications.jobId))
		.where(and(eq(applications.id, applicationId), eq(applications.organizationId, organizationId)))
		.limit(1);

	if (!row) error(404, 'Not found.');
	return row;
}

/** Mark that someone from the org opened the application. */
export async function recordView(
	applicationId: string,
	organizationId: string,
	actorUserId: string
): Promise<void> {
	const [application] = await db
		.select({ id: applications.id })
		.from(applications)
		.where(and(eq(applications.id, applicationId), eq(applications.organizationId, organizationId)))
		.limit(1);

	if (!application) return;

	// Not visible to the candidate: "someone looked at your CV" without a decision
	// following is anxiety, not transparency. It is kept for the employer's own
	// audit trail.
	await db.insert(applicationEvents).values({
		applicationId,
		type: 'viewed',
		actorUserId,
		visibleToCandidate: false
	});
}
