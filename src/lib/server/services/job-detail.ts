import { and, eq, isNull, or, gt, sql } from 'drizzle-orm';
import { db } from '../db';
import { companies } from '../db/schema/company';
import { organizations } from '../db/schema/org';
import { jobs, jobLocations, jobSkills, jobScreeningQuestions } from '../db/schema/job';
import { skills } from '../db/schema/taxonomy';

export interface JobDetail {
	id: string;
	slug: string;
	title: string;
	description: string;
	employmentType: string;
	workMode: string;
	experienceLevel: string;
	salaryMin: number;
	salaryMax: number;
	salaryCurrency: string;
	salaryPeriod: string;
	equityRange: string | null;
	publishedAt: Date | null;
	closesAt: Date | null;
	responseSlaDays: number | null;
	applicantCount: number;
	/** Null on jobs posted before the taxonomy was applied — no benchmark for those. */
	occupationId: string | null;
	/** The first listed location, used to prefer a city benchmark over a national one. */
	locationId: string | null;
	company: {
		id: string;
		name: string;
		slug: string;
		tagline: string | null;
		size: string | null;
		websiteUrl: string | null;
		/** True when the company proved it owns its domain. */
		verified: boolean;
	};
	skills: { name: string; required: boolean }[];
	screeningQuestionCount: number;
}

/**
 * Fetch a job for the public detail page.
 *
 * Only published, undeleted, unexpired jobs — a closed listing must 404 rather
 * than quietly accept applications nobody will read.
 */
export async function findPublishedBySlug(slug: string): Promise<JobDetail | null> {
	const [row] = await db
		.select({
			job: jobs,
			company: companies,
			verified: sql<boolean>`${organizations.domainVerifiedAt} is not null`
		})
		.from(jobs)
		.innerJoin(companies, eq(companies.id, jobs.companyId))
		.innerJoin(organizations, eq(organizations.id, companies.organizationId))
		.where(
			and(
				eq(jobs.slug, slug),
				eq(jobs.status, 'published'),
				isNull(jobs.deletedAt),
				or(isNull(jobs.closesAt), gt(jobs.closesAt, new Date()))
			)
		)
		.limit(1);

	if (!row) return null;

	const [skillRows, [questionCount], [jobLocation]] = await Promise.all([
		db
			.select({ name: skills.name, required: jobSkills.required })
			.from(jobSkills)
			.innerJoin(skills, eq(skills.id, jobSkills.skillId))
			.where(eq(jobSkills.jobId, row.job.id)),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(jobScreeningQuestions)
			.where(eq(jobScreeningQuestions.jobId, row.job.id)),
		db
			.select({ locationId: jobLocations.locationId })
			.from(jobLocations)
			.where(eq(jobLocations.jobId, row.job.id))
			.limit(1)
	]);

	return {
		id: row.job.id,
		slug: row.job.slug,
		title: row.job.title,
		description: row.job.description,
		employmentType: row.job.employmentType,
		workMode: row.job.workMode,
		experienceLevel: row.job.experienceLevel,
		salaryMin: row.job.salaryMin,
		salaryMax: row.job.salaryMax,
		salaryCurrency: row.job.salaryCurrency,
		salaryPeriod: row.job.salaryPeriod,
		equityRange: row.job.equityRange,
		publishedAt: row.job.publishedAt,
		closesAt: row.job.closesAt,
		responseSlaDays: row.job.responseSlaDays,
		occupationId: row.job.occupationId,
		locationId: jobLocation?.locationId ?? null,
		applicantCount: row.job.applicantCount,
		company: {
			id: row.company.id,
			name: row.company.name,
			slug: row.company.slug,
			verified: row.verified,
			tagline: row.company.tagline,
			size: row.company.size,
			websiteUrl: row.company.websiteUrl
		},
		skills: skillRows,
		screeningQuestionCount: questionCount?.count ?? 0
	};
}

/** Records a view. Fire-and-forget — a failed counter must never break the page. */
export async function recordView(jobId: string): Promise<void> {
	await db
		.update(jobs)
		.set({ viewCount: sql`${jobs.viewCount} + 1` })
		.where(eq(jobs.id, jobId));
}
