import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { applicationEvents, applications, type ApplicationStatus } from '../db/schema/application';

import { applicationNotes, interviews, offers, scorecards } from '../db/schema/ats';
import { companies } from '../db/schema/company';
import { users } from '../db/schema/identity';
import { jobs } from '../db/schema/job';
import { orgInvites, orgMembers, organizations } from '../db/schema/org';

/**
 * A company's own data, and closing a company account.
 *
 * The mirror of `account.ts`, and it hits the same wall from the other side.
 * `organizations → jobs → applications` cascades the whole way, so deleting an
 * organization row would erase **every application every candidate ever sent to
 * it**, along with their timelines. That is the same failure `account.ts` refuses
 * for the employer's benefit, pointed at the candidate instead: somebody's record
 * of six months of job hunting disappearing because a company they applied to
 * closed an account.
 *
 * So closing is a closure, not a delete. The listings come down, the team loses
 * access, the public pages go, and the applications stay — with nobody able to
 * reach them.
 */

/** What a company export contains. Its own record of its own hiring. */
export interface OrganizationExport {
	exportedAt: string;
	company: Record<string, unknown> | null;
	team: Record<string, unknown>[];
	jobs: Record<string, unknown>[];
	applications: Record<string, unknown>[];
}

/**
 * Everything the company holds, as data it can keep.
 *
 * Unlike the candidate export this **does** include internal notes and
 * scorecards: they are the company's own record, written by its own people, and
 * `note.ts` exists on the premise that they are never the candidate's to read —
 * not that they are nobody's. The candidate export omits them for the same
 * reason this one includes them.
 */
export async function exportFor(organizationId: string): Promise<OrganizationExport> {
	const [organization] = await db
		.select()
		.from(organizations)
		.where(eq(organizations.id, organizationId))
		.limit(1);

	if (!organization) error(404, 'Not found.');

	const [company] = await db
		.select()
		.from(companies)
		.where(eq(companies.organizationId, organizationId))
		.limit(1);

	const team = await db
		.select({
			name: users.name,
			email: users.email,
			role: orgMembers.role,
			joined: orgMembers.createdAt
		})
		.from(orgMembers)
		.innerJoin(users, eq(users.id, orgMembers.userId))
		.where(eq(orgMembers.organizationId, organizationId));

	const jobRows = await db.select().from(jobs).where(eq(jobs.organizationId, organizationId));

	const applicationRows = await db
		.select({
			id: applications.id,
			jobTitle: jobs.title,
			candidateName: users.name,
			candidateEmail: users.email,
			status: applications.status,
			source: applications.source,
			coverLetter: applications.coverLetter,
			appliedAt: applications.createdAt,
			firstRespondedAt: applications.firstRespondedAt,
			rejectedAt: applications.rejectedAt,
			rejectionReason: applications.rejectionReason
		})
		.from(applications)
		.innerJoin(jobs, eq(jobs.id, applications.jobId))
		.innerJoin(users, eq(users.id, applications.userId))
		.where(eq(applications.organizationId, organizationId));

	const ids = applicationRows.map((row) => row.id);

	const [notes, events, interviewRows, offerRows, scorecardRows] =
		ids.length === 0
			? [[], [], [], [], []]
			: await Promise.all([
					db.select().from(applicationNotes).where(inArray(applicationNotes.applicationId, ids)),
					db.select().from(applicationEvents).where(inArray(applicationEvents.applicationId, ids)),
					db.select().from(interviews).where(inArray(interviews.applicationId, ids)),
					db.select().from(offers).where(inArray(offers.applicationId, ids)),
					db.select().from(scorecards).where(inArray(scorecards.applicationId, ids))
				]);

	const by = <T extends { applicationId: string }>(rows: T[], id: string) =>
		rows.filter((row) => row.applicationId === id);

	return {
		exportedAt: new Date().toISOString(),
		company: company
			? {
					name: company.name,
					slug: company.slug,
					tagline: company.tagline,
					about: company.about,
					websiteUrl: company.websiteUrl,
					size: company.size,
					domain: organization.domain,
					domainVerifiedAt: organization.domainVerifiedAt
				}
			: null,
		team,
		jobs: jobRows.map((job) => ({
			title: job.title,
			slug: job.slug,
			status: job.status,
			description: job.description,
			salaryMin: job.salaryMin,
			salaryMax: job.salaryMax,
			salaryCurrency: job.salaryCurrency,
			salaryPeriod: job.salaryPeriod,
			publishedAt: job.publishedAt,
			closesAt: job.closesAt
		})),
		applications: applicationRows.map((row) => ({
			...row,
			notes: by(notes, row.id).map((note) => ({ body: note.body, writtenAt: note.createdAt })),
			events: by(events, row.id).map((event) => ({
				type: event.type,
				at: event.createdAt,
				visibleToCandidate: event.visibleToCandidate
			})),
			interviews: by(interviewRows, row.id),
			offers: by(offerRows, row.id),
			scorecards: by(scorecardRows, row.id)
		}))
	};
}

/**
 * Why this company cannot be closed yet, or null.
 *
 * One blocker, and it protects somebody outside the company: an offer that has
 * been **sent and not answered** is a decision a candidate is in the middle of
 * making. Closing underneath them leaves them holding a job offer from a company
 * that no longer exists here, with no way to accept it. Withdraw it or wait.
 *
 * Open applications are deliberately **not** a blocker — they are handled, not
 * refused. See `close`.
 */
export async function closureBlocker(organizationId: string): Promise<string | null> {
	const [pending] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(offers)
		.innerJoin(applications, eq(applications.id, offers.applicationId))
		.where(and(eq(applications.organizationId, organizationId), eq(offers.status, 'sent')));

	if ((pending?.count ?? 0) > 0) {
		const n = pending.count;
		return `${n} ${n === 1 ? 'person is' : 'people are'} still deciding on an offer you sent. Withdraw ${n === 1 ? 'it' : 'them'} or wait for an answer before closing.`;
	}

	return null;
}

/** Statuses where nobody is left waiting on this company. */
const SETTLED: ApplicationStatus[] = ['hired', 'rejected', 'withdrawn'];

/**
 * Close a company account.
 *
 * Everything happens in one transaction, and what it does **not** do matters as
 * much as what it does:
 *
 * - Open applications are answered, not abandoned. A company vanishing mid-process
 *   is precisely the ghosting this product exists to argue with, so every
 *   application still in flight is closed with a stated reason and a
 *   candidate-visible event. They get a real answer, and it is true.
 * - **`firstRespondedAt` is never stamped by this.** Routing these through
 *   `changeStatus` would have done it automatically, and that would let a company
 *   that ignored three hundred people buy a perfect response record by closing its
 *   account. The clock records what actually happened.
 * - Nothing is deleted that a candidate depends on. Jobs and the company profile
 *   are soft-deleted so listings come down and the public pages go, while the
 *   applications, their timelines and the job titles on them survive — a
 *   candidate's history must not develop a hole because a company left.
 * - Team access is removed outright. After this nobody can reach the applications,
 *   which is the point: the data is retained for the candidates' sake, not the
 *   company's.
 */
export async function close(
	organizationId: string,
	options: { reason?: string | null } = {}
): Promise<{ jobsClosed: number; applicationsAnswered: number }> {
	const blocker = await closureBlocker(organizationId);
	if (blocker) error(400, blocker);

	const reason =
		options.reason?.trim() ||
		'This company has closed its Fann account, so this application will not go any further.';

	return db.transaction(async (tx) => {
		const open = await tx
			.select({ id: applications.id })
			.from(applications)
			.where(
				and(
					eq(applications.organizationId, organizationId),
					// `notInArray`, never a JS array interpolated into a `sql` template —
					// Postgres cannot parse that as an array.
					notInArray(applications.status, SETTLED)
				)
			);

		if (open.length > 0) {
			const ids = open.map((row) => row.id);

			await tx
				.update(applications)
				.set({
					status: 'rejected',
					rejectedAt: new Date(),
					rejectionReason: reason
					// firstRespondedAt is deliberately untouched — see the note above.
				})
				.where(inArray(applications.id, ids));

			// The timeline is the candidate's record of what happened, and "the
			// company left" is exactly the kind of thing it exists to explain.
			await tx.insert(applicationEvents).values(
				ids.map((applicationId) => ({
					applicationId,
					type: 'status_changed' as const,
					// No actor: this is the company closing, not a person deciding about
					// this candidate, and the timeline should not imply somebody read it.
					actorUserId: null,
					visibleToCandidate: true,
					payload: { from: null, to: 'rejected', reason }
				}))
			);
		}

		const closed = await tx
			.update(jobs)
			.set({ status: 'closed', deletedAt: new Date() })
			.where(and(eq(jobs.organizationId, organizationId), isNull(jobs.deletedAt)))
			.returning({ id: jobs.id });

		// Takes the public company page and the directory entry down.
		await tx
			.update(companies)
			.set({ deletedAt: new Date() })
			.where(and(eq(companies.organizationId, organizationId), isNull(companies.deletedAt)));

		await tx
			.update(organizations)
			.set({ deletedAt: new Date(), domainVerifiedAt: null })
			.where(eq(organizations.id, organizationId));

		await tx.delete(orgMembers).where(eq(orgMembers.organizationId, organizationId));
		await tx.delete(orgInvites).where(eq(orgInvites.organizationId, organizationId));

		return { jobsClosed: closed.length, applicationsAnswered: open.length };
	});
}

/** Members who will lose access, so the confirmation can say how many. */
export async function closureImpact(organizationId: string): Promise<{
	openJobs: number;
	waitingCandidates: number;
	teamMembers: number;
}> {
	const [row] = await db
		.select({
			openJobs: sql<number>`(
				select count(*)::int from jobs
				where jobs.organization_id = ${organizationId}
					and jobs.deleted_at is null
					and jobs.status = 'published'
			)`,
			waitingCandidates: sql<number>`(
				select count(*)::int from applications
				where applications.organization_id = ${organizationId}
					and applications.status not in ('hired', 'rejected', 'withdrawn')
			)`,
			teamMembers: sql<number>`(
				select count(*)::int from org_members
				where org_members.organization_id = ${organizationId}
			)`
		})
		.from(organizations)
		.where(eq(organizations.id, organizationId))
		.limit(1);

	return (
		row ?? {
			openJobs: 0,
			waitingCandidates: 0,
			teamMembers: 0
		}
	);
}
