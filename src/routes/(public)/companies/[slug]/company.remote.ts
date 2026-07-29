import * as v from 'valibot';
import { error, redirect } from '@sveltejs/kit';
import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { getRequestEvent, query } from '$app/server';
import { db } from '#lib/server/db';
import { companies } from '#lib/server/db/schema/company';
import { jobs } from '#lib/server/db/schema/job';
import { organizations } from '#lib/server/db/schema/org';
import { resolveSlug } from '#lib/server/services/company';
import { describeStats, statsForCompany } from '#lib/server/services/reputation';
import { followerCount, postsForCompany } from '#lib/server/services/social';

/**
 * A company's public page.
 *
 * Everything here is either written by the company or computed from its own
 * record. There are no reviews and no free text from third parties — moderating
 * those is a full-time job, and the numbers say more anyway.
 */
export const getCompany = query(v.string(), async (slug) => {
	const [company] = await db
		.select({
			id: companies.id,
			name: companies.name,
			slug: companies.slug,
			tagline: companies.tagline,
			about: companies.about,
			websiteUrl: companies.websiteUrl,
			size: companies.size,
			foundedYear: companies.foundedYear,
			domainVerifiedAt: organizations.domainVerifiedAt
		})
		.from(companies)
		.innerJoin(organizations, eq(organizations.id, companies.organizationId))
		.where(and(eq(companies.slug, slug), isNull(companies.deletedAt)))
		.limit(1);

	if (!company) {
		// Might be an address this company used to have. Old links are expected to
		// keep working, and a redirect rather than serving the page here is what
		// stops one company living at two live URLs — which splits every share and
		// every search result between them.
		const resolved = await resolveSlug(slug);
		if (resolved) redirect(308, `/companies/${resolved.currentSlug}`);

		error(404, 'Not found.');
	}

	const openJobs = await db
		.select({
			slug: jobs.slug,
			title: jobs.title,
			workMode: jobs.workMode,
			employmentType: jobs.employmentType,
			salaryMin: jobs.salaryMin,
			salaryMax: jobs.salaryMax,
			salaryCurrency: jobs.salaryCurrency,
			salaryPeriod: jobs.salaryPeriod,
			responseSlaDays: jobs.responseSlaDays,
			publishedAt: jobs.publishedAt
		})
		.from(jobs)
		.where(
			and(
				eq(jobs.companyId, company.id),
				eq(jobs.status, 'published'),
				isNull(jobs.deletedAt),
				or(isNull(jobs.closesAt), gt(jobs.closesAt, sql`now()`))
			)
		)
		.orderBy(asc(jobs.title));

	const stats = await statsForCompany(company.id);

	const { locals } = getRequestEvent();
	const [posts, followers] = await Promise.all([
		postsForCompany(company.id, locals.user?.id ?? null),
		followerCount(company.id)
	]);

	return {
		company,
		posts,
		followers,
		jobs: openJobs,
		stats,
		// Phrased in the service so this page, the directory and the job page cannot
		// describe the same company differently.
		summary: describeStats(stats)
	};
});
