import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { companies } from '../db/schema/company';
import { jobs, savedJobs } from '../db/schema/job';

/**
 * Jobs a candidate has kept for later.
 *
 * A bookmark and nothing more: saving is invisible to the employer. Somebody
 * browsing at work should not be signalling interest to a company by reading a
 * listing twice, and a "3 people saved this" counter is one product decision away
 * from becoming that.
 */

/** Save, or do nothing if it is already saved. */
export async function save(jobId: string, userId: string): Promise<void> {
	await db.insert(savedJobs).values({ jobId, userId }).onConflictDoNothing();
}

export async function remove(jobId: string, userId: string): Promise<void> {
	await db.delete(savedJobs).where(and(eq(savedJobs.jobId, jobId), eq(savedJobs.userId, userId)));
}

/**
 * The candidate's saved jobs, newest first.
 *
 * Closed and deleted listings are kept rather than hidden. A job that vanishes
 * from this list looks like the product lost it; one that says it has closed
 * tells the person what actually happened.
 */
export async function listForUser(userId: string) {
	return db
		.select({
			savedAt: savedJobs.createdAt,
			id: jobs.id,
			slug: jobs.slug,
			title: jobs.title,
			workMode: jobs.workMode,
			employmentType: jobs.employmentType,
			salaryMin: jobs.salaryMin,
			salaryMax: jobs.salaryMax,
			salaryCurrency: jobs.salaryCurrency,
			salaryPeriod: jobs.salaryPeriod,
			responseSlaDays: jobs.responseSlaDays,
			companyName: companies.name,
			companySlug: companies.slug,
			/** Whether it can still be applied for, decided by the database's clock. */
			open: sql<boolean>`
				${jobs.status} = 'published'
				and ${jobs.deletedAt} is null
				and (${jobs.closesAt} is null or ${jobs.closesAt} > now())
			`
		})
		.from(savedJobs)
		.innerJoin(jobs, eq(jobs.id, savedJobs.jobId))
		.innerJoin(companies, eq(companies.id, jobs.companyId))
		.where(eq(savedJobs.userId, userId))
		.orderBy(desc(savedJobs.createdAt));
}

/**
 * Which of these jobs the user has saved.
 *
 * Takes a list so a board of twenty cards costs one query rather than twenty.
 * Returns a Set because every caller only asks "is this one in it".
 */
export async function savedAmong(jobIds: string[], userId: string): Promise<Set<string>> {
	if (jobIds.length === 0) return new Set();

	const rows = await db
		.select({ jobId: savedJobs.jobId })
		.from(savedJobs)
		.where(and(eq(savedJobs.userId, userId), inArray(savedJobs.jobId, jobIds)));

	return new Set(rows.map((row) => row.jobId));
}

/** How many still-open jobs the candidate has saved, for the navigation badge. */
export async function openCount(userId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(savedJobs)
		.innerJoin(jobs, eq(jobs.id, savedJobs.jobId))
		.where(
			and(
				eq(savedJobs.userId, userId),
				eq(jobs.status, 'published'),
				isNull(jobs.deletedAt),
				or(isNull(jobs.closesAt), gt(jobs.closesAt, sql`now()`))
			)
		);

	return row?.count ?? 0;
}
