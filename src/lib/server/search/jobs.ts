import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db';
import type { EmploymentType, ExperienceLevel, WorkMode } from '../db/schema/job';

export interface JobSearchFilters {
	/** Free text. Matched against the generated tsvector, with a trigram fallback. */
	q?: string;
	workModes?: WorkMode[];
	employmentTypes?: EmploymentType[];
	experienceLevels?: ExperienceLevel[];
	/** Only jobs whose maximum is at or above this, in the listing's currency. */
	salaryMin?: number;
	companySlug?: string;
	page?: number;
	perPage?: number;
	sort?: 'relevance' | 'recent' | 'salary';
}

export interface JobSearchResult {
	id: string;
	slug: string;
	title: string;
	workMode: WorkMode;
	employmentType: EmploymentType;
	experienceLevel: ExperienceLevel;
	salaryMin: number;
	salaryMax: number;
	salaryCurrency: string;
	salaryPeriod: string;
	publishedAt: Date | null;
	companyName: string;
	companySlug: string;
	/** True when the company proved it owns its domain. */
	companyVerified: boolean;
	applicantCount: number;
	responseSlaDays: number | null;
}

export interface Facet {
	value: string;
	count: number;
}

export interface JobSearchResponse {
	results: JobSearchResult[];
	total: number;
	page: number;
	perPage: number;
	facets: {
		workMode: Facet[];
		employmentType: Facet[];
		experienceLevel: Facet[];
	};
}

const MAX_PER_PAGE = 50;

/**
 * Blended job search.
 *
 * Three signals, normalized to 0–1 and weighted:
 *   lexical  0.5  — `ts_rank_cd` over the generated tsvector
 *   trigram  0.2  — similarity on the title, so a typo still finds the job
 *   recency  0.3  — exponential decay over 30 days
 *
 * Semantic (pgvector) recall joins this blend in Phase 5; the weights are named
 * constants so adding it is a re-balance rather than a rewrite.
 *
 * Filters are hard `WHERE` clauses, never score adjustments. Someone filtering for
 * remote wants remote, not "mostly remote, ranked higher".
 */
export async function searchJobs(filters: JobSearchFilters = {}): Promise<JobSearchResponse> {
	const page = Math.max(1, filters.page ?? 1);
	const perPage = Math.min(MAX_PER_PAGE, Math.max(1, filters.perPage ?? 20));
	const offset = (page - 1) * perPage;

	const query = filters.q?.trim();
	const conditions: SQL[] = [
		sql`j.status = 'published'`,
		sql`j.deleted_at is null`,
		sql`(j.closes_at is null or j.closes_at > now())`
	];

	if (query) {
		// `websearch_to_tsquery` accepts what people actually type — quoted phrases,
		// `or`, leading minus — instead of erroring on unbalanced operators the way
		// `to_tsquery` does.
		conditions.push(
			sql`(j.search_vector @@ websearch_to_tsquery('english', ${query}) or j.title % ${query})`
		);
	}
	// Each value is bound as its own parameter. Passing a JS array to `= any($1)`
	// sends it as one scalar, which Postgres then fails to parse as an array.
	const anyOf = (values: string[]): SQL =>
		sql.join(
			values.map((value) => sql`${value}`),
			sql`, `
		);

	if (filters.workModes?.length) {
		conditions.push(sql`j.work_mode in (${anyOf(filters.workModes)})`);
	}
	if (filters.employmentTypes?.length) {
		conditions.push(sql`j.employment_type in (${anyOf(filters.employmentTypes)})`);
	}
	if (filters.experienceLevels?.length) {
		conditions.push(sql`j.experience_level in (${anyOf(filters.experienceLevels)})`);
	}
	if (filters.salaryMin !== undefined) {
		conditions.push(sql`j.salary_max >= ${filters.salaryMin}`);
	}
	if (filters.companySlug) {
		conditions.push(sql`c.slug = ${filters.companySlug}`);
	}

	const where = sql.join(conditions, sql` and `);

	const relevance = query
		? sql`(
				0.5 * coalesce(ts_rank_cd(j.search_vector, websearch_to_tsquery('english', ${query})), 0)
				+ 0.2 * coalesce(similarity(j.title, ${query}), 0)
				+ 0.3 * exp(-extract(epoch from (now() - coalesce(j.published_at, j.created_at))) / 2592000.0)
			)`
		: sql`exp(-extract(epoch from (now() - coalesce(j.published_at, j.created_at))) / 2592000.0)`;

	// Ordering happens outside the CTE, where only `matched`'s own columns are in
	// scope — hence `m.score` rather than repeating the expression over `j`.
	const orderBy =
		filters.sort === 'recent'
			? sql`coalesce(m.published_at, m.created_at) desc`
			: filters.sort === 'salary'
				? sql`m.salary_max desc`
				: sql`m.score desc, coalesce(m.published_at, m.created_at) desc`;

	/**
	 * One round trip for page, total and facets.
	 *
	 * Facets are counted over the *filtered* set via the same CTE, so the numbers
	 * beside each checkbox describe the result the user would actually get. Running
	 * them as separate queries is how facet counts drift out of sync with results.
	 */
	const rows = await db.execute<{
		id: string;
		slug: string;
		title: string;
		work_mode: WorkMode;
		employment_type: EmploymentType;
		experience_level: ExperienceLevel;
		salary_min: number;
		salary_max: number;
		salary_currency: string;
		salary_period: string;
		published_at: Date | null;
		company_name: string;
		company_verified: boolean;
		company_slug: string;
		applicant_count: number;
		response_sla_days: number | null;
		total: number;
		facets: JobSearchResponse['facets'];
	}>(sql`
		with matched as (
			select
				j.id, j.slug, j.title, j.work_mode, j.employment_type, j.experience_level,
				j.salary_min, j.salary_max, j.salary_currency, j.salary_period,
				j.published_at, j.created_at, j.applicant_count, j.response_sla_days,
				c.name as company_name, c.slug as company_slug,
				o.domain_verified_at is not null as company_verified,
				${relevance} as score
			from jobs j
			join companies c on c.id = j.company_id
			join organizations o on o.id = c.organization_id
			where ${where}
		),
		counted as (select count(*)::int as total from matched),
		facets as (
			select jsonb_build_object(
				'workMode', (
					select coalesce(jsonb_agg(jsonb_build_object('value', work_mode, 'count', n) order by n desc), '[]'::jsonb)
					from (select work_mode, count(*)::int as n from matched group by work_mode) w
				),
				'employmentType', (
					select coalesce(jsonb_agg(jsonb_build_object('value', employment_type, 'count', n) order by n desc), '[]'::jsonb)
					from (select employment_type, count(*)::int as n from matched group by employment_type) e
				),
				'experienceLevel', (
					select coalesce(jsonb_agg(jsonb_build_object('value', experience_level, 'count', n) order by n desc), '[]'::jsonb)
					from (select experience_level, count(*)::int as n from matched group by experience_level) x
				)
			) as facets
		)
		select m.*, counted.total, facets.facets
		from matched m, counted, facets
		order by ${orderBy}
		limit ${perPage} offset ${offset}
	`);

	const first = rows[0];

	return {
		results: rows.map((row) => ({
			id: row.id,
			slug: row.slug,
			title: row.title,
			workMode: row.work_mode,
			employmentType: row.employment_type,
			experienceLevel: row.experience_level,
			salaryMin: row.salary_min,
			salaryMax: row.salary_max,
			salaryCurrency: row.salary_currency,
			salaryPeriod: row.salary_period,
			// Raw `execute` skips Drizzle's column mapping, so timestamps arrive as
			// strings rather than Dates.
			publishedAt: row.published_at ? new Date(row.published_at) : null,
			companyName: row.company_name,
			companyVerified: row.company_verified,
			companySlug: row.company_slug,
			applicantCount: row.applicant_count,
			responseSlaDays: row.response_sla_days
		})),
		// With no rows there is nothing to read the aggregates off, and the answer is
		// zero anyway.
		total: first?.total ?? 0,
		page,
		perPage,
		facets: first?.facets ?? { workMode: [], employmentType: [], experienceLevel: [] }
	};
}
