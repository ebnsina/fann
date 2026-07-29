import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { query } from '$app/server';
import { searchJobs } from '#lib/server/search/jobs';
import * as jobDetail from '#lib/server/services/job-detail';
import { describeStats, statsForCompany } from '#lib/server/services/reputation';
import { benchmarkFor, describePosition, positionAgainst } from '#lib/server/services/salary';

const workMode = v.picklist(['onsite', 'hybrid', 'remote']);
const employmentType = v.picklist([
	'full_time',
	'part_time',
	'contract',
	'temporary',
	'internship'
]);
const experienceLevel = v.picklist([
	'internship',
	'entry',
	'mid',
	'senior',
	'staff',
	'principal',
	'executive'
]);

/**
 * The board query.
 *
 * Arguments mirror the URL so the page can be linked, shared and crawled — the
 * filter state lives in the address bar, not in component state.
 */
export const findJobs = query(
	v.object({
		q: v.optional(v.pipe(v.string(), v.maxLength(200)), ''),
		workModes: v.optional(v.array(workMode), []),
		employmentTypes: v.optional(v.array(employmentType), []),
		experienceLevels: v.optional(v.array(experienceLevel), []),
		salaryMin: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(10_000_000))),
		companySlug: v.optional(v.string()),
		page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
		sort: v.optional(v.picklist(['relevance', 'recent', 'salary']), 'relevance')
	}),
	async (input) => {
		return searchJobs({
			q: input.q || undefined,
			workModes: input.workModes.length ? input.workModes : undefined,
			employmentTypes: input.employmentTypes.length ? input.employmentTypes : undefined,
			experienceLevels: input.experienceLevels.length ? input.experienceLevels : undefined,
			salaryMin: input.salaryMin,
			companySlug: input.companySlug,
			page: input.page,
			sort: input.sort
		});
	}
);

/** A single published job, by slug. */
export const getJob = query(v.string(), async (slug) => {
	const job = await jobDetail.findPublishedBySlug(slug);
	if (!job) error(404, 'That job is no longer listed.');

	// The company's measured record travels with the listing. This is the page
	// where somebody decides whether to spend an evening on an application, so it
	// is the page where "do they actually reply" belongs — not two clicks away.
	const stats = await statsForCompany(job.company.id);

	/*
	 * Where this listing sits against its market.
	 *
	 * Null whenever there is no benchmark to compare with — an unclassified job, a
	 * currency nobody else posts in, or a role with too few listings to say
	 * anything. All three are "we do not know", and the page shows nothing rather
	 * than a comparison with an invented baseline.
	 */
	const benchmark = job.occupationId
		? await benchmarkFor({
				occupationId: job.occupationId,
				experienceLevel: job.experienceLevel,
				locationId: job.locationId,
				currency: job.salaryCurrency
			})
		: null;

	const market = benchmark ? positionAgainst(job, benchmark) : null;

	return {
		...job,
		stats,
		statsSummary: describeStats(stats),
		market,
		marketSummary: market ? describePosition(market) : null
	};
});
