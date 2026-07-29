import { sql } from 'drizzle-orm';
import { query } from '$app/server';
import { db } from '#lib/server/db';
import { annualise, listBenchmarks } from '#lib/server/services/salary';

/**
 * Numbers for the landing page.
 *
 * Read live rather than hard-coded. A marketing page quoting invented figures is
 * the first thing that goes stale, and this product's whole pitch is that its
 * claims are checkable.
 */
export const landingStats = query(async () => {
	const [row] = await db.execute<{
		open_roles: number;
		companies: number;
		median_salary: number | null;
		with_response_promise: number;
	}>(sql`
		select
			count(*)::int as open_roles,
			count(distinct company_id)::int as companies,
			-- Midpoint of each range, so one outlier ceiling cannot skew the figure,
			-- and annualised first — an hourly rate dropped in raw would drag the
			-- median of a list of salaries towards zero.
			percentile_cont(0.5) within group (
				order by ((salary_min + salary_max) / 2.0) * case salary_period
					when 'hour' then 2080
					when 'day' then 260
					when 'month' then 12
					else 1
				end
			)::int as median_salary,
			count(*) filter (where response_sla_days is not null)::int as with_response_promise
		from jobs
		where status = 'published'
			and deleted_at is null
			and (closes_at is null or closes_at > now())
	`);

	return {
		openRoles: row?.open_roles ?? 0,
		companies: row?.companies ?? 0,
		medianSalary: row?.median_salary ?? null,
		withResponsePromise: row?.with_response_promise ?? 0
	};
});

/**
 * Every open role's pay, for the chart in the hero.
 *
 * The hero claims every job here shows what it pays. This is that claim drawn
 * from the table it is made about — one dot per live listing, so the picture is
 * wrong the moment the claim is.
 *
 * Two normalisations, both of which matter and neither of which is cosmetic:
 *
 *   - Periods are annualised. A $95/hour contract and a $190K salary belong on
 *     the same axis; putting the raw numbers there would file the contract next
 *     to nothing and squash every real salary into the right-hand edge.
 *   - Only the most common currency is charted. There is no exchange rate in this
 *     product, so mixing currencies on one axis would be inventing one. The
 *     count of everything left out is returned so the caption can say so.
 */
export const salaryDistribution = query(async () => {
	const rows = await db.execute<{
		slug: string;
		title: string;
		company_name: string;
		salary_min: number;
		salary_max: number;
		salary_currency: string;
		salary_period: string;
		annual_mid: number;
		omitted: number;
	}>(sql`
		with live as (
			select
				j.slug, j.title, j.salary_min, j.salary_max,
				j.salary_currency, j.salary_period,
				c.name as company_name,
				-- The same expression the benchmarks are built from, so the picture here
				-- and the "above the going rate" line on a job page cannot disagree
				-- about what one listing pays.
				${annualise(sql`((j.salary_min + j.salary_max) / 2.0)`, sql`j.salary_period`)}::int as annual_mid
			from jobs j
			join companies c on c.id = j.company_id
			where j.status = 'published'
				and j.deleted_at is null
				and (j.closes_at is null or j.closes_at > now())
		),
		dominant as (
			select salary_currency
			from live
			group by salary_currency
			order by count(*) desc, salary_currency
			limit 1
		)
		select
			l.slug, l.title, l.company_name,
			l.salary_min, l.salary_max, l.salary_currency, l.salary_period,
			l.annual_mid,
			-- Everything the chart will not draw: other currencies, plus whatever the
			-- row cap below cuts off. Counted here so the caption can admit to it
			-- rather than quietly showing a smaller market than exists.
			(
				(select count(*) from live where salary_currency <> (select salary_currency from dominant))
				+ greatest(
					0,
					(select count(*) from live where salary_currency = (select salary_currency from dominant))
						- 600
				)
			)::int as omitted
		from live l
		where l.salary_currency = (select salary_currency from dominant)
		order by l.annual_mid
		-- A cap so the payload cannot grow without bound. The swarm reads the same at
		-- 600 dots as at 6000; the count above reports anything dropped.
		limit 600
	`);

	return {
		currency: rows[0]?.salary_currency ?? 'USD',
		// Counted in SQL — see the query. Everything the chart does not draw.
		omitted: rows[0]?.omitted ?? 0,
		jobs: rows.map((row) => ({
			slug: row.slug,
			title: row.title,
			companyName: row.company_name,
			salaryMin: row.salary_min,
			salaryMax: row.salary_max,
			salaryCurrency: row.salary_currency,
			salaryPeriod: row.salary_period,
			annualMid: row.annual_mid
		}))
	};
});

/** A handful of live roles, so the page shows the product rather than describing it. */
export const featuredJobs = query(async () => {
	const rows = await db.execute<{
		slug: string;
		title: string;
		work_mode: string;
		employment_type: string;
		salary_min: number;
		salary_max: number;
		salary_currency: string;
		salary_period: string;
		company_name: string;
		company_slug: string;
		company_verified: boolean;
		response_sla_days: number | null;
	}>(sql`
		select
			j.slug, j.title, j.work_mode, j.employment_type,
			j.salary_min, j.salary_max, j.salary_currency, j.salary_period,
			j.response_sla_days,
			c.name as company_name, c.slug as company_slug,
			o.domain_verified_at is not null as company_verified
		from jobs j
		join companies c on c.id = j.company_id
		join organizations o on o.id = c.organization_id
		where j.status = 'published'
			and j.deleted_at is null
			and (j.closes_at is null or j.closes_at > now())
		-- Newest first: a landing page showing month-old roles reads as abandoned.
		order by coalesce(j.published_at, j.created_at) desc
		limit 6
	`);

	return rows.map((row) => ({
		slug: row.slug,
		title: row.title,
		workMode: row.work_mode,
		employmentType: row.employment_type,
		salaryMin: row.salary_min,
		salaryMax: row.salary_max,
		salaryCurrency: row.salary_currency,
		salaryPeriod: row.salary_period,
		companyName: row.company_name,
		companySlug: row.company_slug,
		companyVerified: row.company_verified,
		responseSlaDays: row.response_sla_days
	}));
});

/**
 * A few published pay benchmarks, for the landing page.
 *
 * Real rows rather than an illustration, for the same reason the hero chart is
 * drawn from the jobs table: a made-up example of "what this role pays" on a page
 * arguing for pay transparency would be self-defeating.
 *
 * The most-evidenced ones, because the point being made is that these are counted
 * rather than asserted — a row backed by nine jobs makes that case better than one
 * backed by the minimum.
 */
export const payHighlights = query(async () => {
	const benchmarks = await listBenchmarks('advertised');

	return benchmarks
		.slice()
		.sort((a, b) => b.sampleSize - a.sampleSize)
		.slice(0, 4);
});
