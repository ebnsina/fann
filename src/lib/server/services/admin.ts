import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { companies } from '../db/schema/company';
import { users } from '../db/schema/identity';
import { jobs } from '../db/schema/job';
import { organizations } from '../db/schema/org';
import { emailLog } from '../db/schema/platform';

/**
 * The platform console.
 *
 * Everything here is **read-only except one action**, and that is deliberate. An
 * admin screen accumulates buttons until somebody can quietly change anything
 * about anyone, and the first thing an attacker who gets a staff session looks
 * for is the lever that grants more access. There is none: `users.platformAdmin`
 * still has no way to be set from the product, and nothing below writes to it.
 *
 * `assertStaff` runs inside every function rather than in the route group.
 * Remote functions are reachable as raw HTTP, so living under `(admin)` protects
 * nothing. Denials are **not-found**, so probing does not confirm the console
 * exists — the same choice `moderation.ts` makes for the same reason.
 */

export async function assertStaff(userId: string): Promise<void> {
	const [row] = await db
		.select({ platformAdmin: users.platformAdmin })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!row?.platformAdmin) error(404, 'Not found.');
}

export interface PlatformOverview {
	users: number;
	companies: number;
	publishedJobs: number;
	applications: number;
	/** Applications that got a reply, over those old enough to judge. */
	answered: number;
	awaitingAnswer: number;
	posts: number;
	emailsFailed: number;
}

/**
 * The numbers that say whether the product is keeping its own promise.
 *
 * Deliberately not a vanity dashboard. Sign-ups and page views tell staff
 * nothing they can act on; "how many people are still waiting for an answer" and
 * "how much email is failing" are both things somebody should do something
 * about, and both are invisible from anywhere else in the product.
 */
export async function overview(userId: string): Promise<PlatformOverview> {
	await assertStaff(userId);

	const [row] = await db
		.select({
			users: sql<number>`(select count(*)::int from users where deactivated_at is null)`,
			companies: sql<number>`(select count(*)::int from companies where deleted_at is null)`,
			publishedJobs: sql<number>`(
				select count(*)::int from jobs where status = 'published' and deleted_at is null
			)`,
			applications: sql<number>`(select count(*)::int from applications)`,
			answered: sql<number>`(
				select count(*)::int from applications where first_responded_at is not null
			)`,
			// Excludes anyone inside the grace window, so the figure means "left
			// waiting" rather than "applied this morning" — the same 14 days
			// `reputation.ts` uses, and for the same reason.
			awaitingAnswer: sql<number>`(
				select count(*)::int from applications
				where first_responded_at is null
					and status not in ('hired', 'rejected', 'withdrawn')
					and created_at < now() - make_interval(days => 14)
			)`,
			posts: sql<number>`(select count(*)::int from posts where deleted_at is null)`,
			emailsFailed: sql<number>`(
				select count(*)::int from email_log
				where status = 'failed' and created_at > now() - make_interval(days => 7)
			)`
		})
		.from(sql`(select 1) as one`);

	return row;
}

export interface AdminUserRow {
	id: string;
	name: string;
	email: string;
	joinedAt: Date;
	verified: boolean;
	deactivated: boolean;
	platformAdmin: boolean;
	organizations: number;
	applications: number;
}

/**
 * Find one person, for a support question.
 *
 * A search rather than a browsable list of everybody: the useful shape is "this
 * address wrote in", and an endpoint that pages through every account is a
 * export of the user table waiting to happen.
 */
export async function findUsers(userId: string, term: string, limit = 25): Promise<AdminUserRow[]> {
	await assertStaff(userId);

	const search = term.trim();
	if (search.length < 2) return [];

	const pattern = `%${search}%`;

	return db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			joinedAt: users.createdAt,
			verified: sql<boolean>`${users.emailVerifiedAt} is not null`,
			deactivated: sql<boolean>`${users.deactivatedAt} is not null`,
			platformAdmin: users.platformAdmin,
			organizations: sql<number>`(
				select count(*)::int from org_members where org_members.user_id = ${users.id}
			)`,
			applications: sql<number>`(
				select count(*)::int from applications where applications.user_id = ${users.id}
			)`
		})
		.from(users)
		.where(or(ilike(users.email, pattern), ilike(users.name, pattern)))
		.orderBy(desc(users.createdAt))
		.limit(limit);
}

export interface AdminOrganizationRow {
	id: string;
	name: string;
	slug: string;
	createdAt: Date;
	closed: boolean;
	verified: boolean;
	members: number;
	publishedJobs: number;
	applications: number;
	awaitingAnswer: number;
}

/** Companies, newest first, with the figures that say how they are behaving. */
export async function listOrganizations(
	userId: string,
	options: { term?: string; limit?: number } = {}
): Promise<AdminOrganizationRow[]> {
	await assertStaff(userId);

	const term = options.term?.trim();
	const pattern = term ? `%${term}%` : null;

	return db
		.select({
			id: organizations.id,
			name: organizations.name,
			slug: organizations.slug,
			createdAt: organizations.createdAt,
			closed: sql<boolean>`${organizations.deletedAt} is not null`,
			verified: sql<boolean>`${organizations.domainVerifiedAt} is not null`,
			members: sql<number>`(
				select count(*)::int from org_members
				where org_members.organization_id = ${organizations.id}
			)`,
			publishedJobs: sql<number>`(
				select count(*)::int from jobs
				where jobs.organization_id = ${organizations.id}
					and jobs.status = 'published' and jobs.deleted_at is null
			)`,
			applications: sql<number>`(
				select count(*)::int from applications
				where applications.organization_id = ${organizations.id}
			)`,
			// The figure this console exists for: people a company has left waiting
			// past the grace window. Nothing else in the product shows it across
			// companies, so nobody could see a pattern before.
			awaitingAnswer: sql<number>`(
				select count(*)::int from applications
				where applications.organization_id = ${organizations.id}
					and applications.first_responded_at is null
					and applications.status not in ('hired', 'rejected', 'withdrawn')
					and applications.created_at < now() - make_interval(days => 14)
			)`
		})
		.from(organizations)
		.where(
			pattern
				? or(ilike(organizations.name, pattern), ilike(organizations.slug, pattern))
				: undefined
		)
		.orderBy(desc(organizations.createdAt))
		.limit(options.limit ?? 50);
}

export interface AdminJobRow {
	id: string;
	title: string;
	slug: string;
	companyName: string;
	status: string;
	publishedAt: Date | null;
	takenDown: boolean;
	applicants: number;
}

/** Published listings, for taking one down when it should not be up. */
export async function listJobs(
	userId: string,
	options: { term?: string; limit?: number } = {}
): Promise<AdminJobRow[]> {
	await assertStaff(userId);

	const term = options.term?.trim();
	const pattern = term ? `%${term}%` : null;

	return db
		.select({
			id: jobs.id,
			title: jobs.title,
			slug: jobs.slug,
			companyName: companies.name,
			status: jobs.status,
			publishedAt: jobs.publishedAt,
			takenDown: sql<boolean>`${jobs.deletedAt} is not null`,
			applicants: jobs.applicantCount
		})
		.from(jobs)
		.innerJoin(companies, eq(companies.id, jobs.companyId))
		.where(pattern ? or(ilike(jobs.title, pattern), ilike(companies.name, pattern)) : undefined)
		.orderBy(desc(jobs.createdAt))
		.limit(options.limit ?? 50);
}

/**
 * Take a listing off the public board, or put it back.
 *
 * The only thing on this console that writes, and it is deliberately the
 * smallest lever that does the job: a job post is public content on a page this
 * platform serves, so somebody has to be able to remove one. It is **reversible
 * and soft** — the row, its applications and their timelines are untouched, so
 * this can be undone and can be shown to have been wrong. That is the same
 * reasoning as hiding rather than deleting a post in `moderation.ts`.
 *
 * There is deliberately no way to edit a job, suspend a user, or grant staff
 * access from here. Each of those is a bigger power than the problem it would
 * solve, and the last one is the first thing somebody with a stolen session
 * looks for.
 */
export async function setJobTakenDown(
	userId: string,
	jobId: string,
	takenDown: boolean
): Promise<void> {
	await assertStaff(userId);

	const [job] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
	if (!job) error(404, 'Not found.');

	await db
		.update(jobs)
		.set(
			takenDown
				? { deletedAt: new Date(), status: 'closed' }
				: // Restored as a draft rather than straight back onto the board: putting
					// it back live is the company's decision, and re-publishing somebody
					// else's listing on their behalf is not this console's job.
					{ deletedAt: null, status: 'draft' }
		)
		.where(eq(jobs.id, jobId));
}

/** Recent delivery failures — the thing that makes a broken mailer visible. */
export async function failedEmails(userId: string, limit = 50) {
	await assertStaff(userId);

	return db
		.select({
			id: emailLog.id,
			toEmail: emailLog.toEmail,
			tag: emailLog.tag,
			subject: emailLog.subject,
			error: emailLog.error,
			createdAt: emailLog.createdAt
		})
		.from(emailLog)
		.where(eq(emailLog.status, 'failed'))
		.orderBy(desc(emailLog.createdAt))
		.limit(limit);
}
