import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { salarySubmissions, type SalarySubmission } from '../db/schema/salary';
import type { SalaryReportInput } from '#lib/schemas/salary';
import type { experienceLevels } from '#lib/schemas/job';

/** The enum union, so callers cannot pass a level Postgres will reject. */
type ExperienceLevel = (typeof experienceLevels)[number];

/**
 * What a kind of job pays, and whether a given listing is generous.
 *
 * The product's argument is that a visible salary beats a hidden one. This
 * answers the question that immediately follows — "is that a good number?" — and
 * the way to answer it badly is to answer it too eagerly. Three rules, the same
 * shape as the ones in `reputation.ts` and for the same reason:
 *
 *   1. **Nothing below `MIN_SAMPLE` is published**, and under-sized groups are
 *      not written to the table at all. A missing row and "not enough data" are
 *      therefore the same thing, so no caller can render a median built from
 *      three numbers by forgetting a check.
 *   2. **One currency per figure, never converted.** There is no exchange rate in
 *      this product, and inventing one would be the single most misleading thing
 *      on the page.
 *   3. **Advertised and reported pay are never blended.** What a company puts on
 *      a listing and what people say they take home are different measurements.
 *      A number that is secretly half of each describes nothing.
 */

/**
 * Below this, a group gets no benchmark.
 *
 * Higher than the response-stats threshold of five, because a percentile needs
 * more data than a percentage does: p10 and p90 of eight numbers are just the
 * smallest and largest, dressed up as statistics.
 */
export const MIN_SAMPLE = 8;

export type BenchmarkSource = 'advertised' | 'reported';

/**
 * Annualisation, written once.
 *
 * Hours and days use conventional full-time figures (40h × 52w, 260 working
 * days). They are a convention rather than a measurement, which is why anything
 * built on them is labelled "typical" rather than presented as exact. This exact
 * expression is also what the landing chart plots — two spellings of it would let
 * the picture on the home page and the benchmark on a job page disagree about
 * what the same listing pays.
 */
export function annualise(amount: ReturnType<typeof sql>, period: ReturnType<typeof sql>) {
	return sql`(${amount} * case ${period}
		when 'hour' then 2080
		when 'day' then 260
		when 'month' then 12
		else 1
	end)`;
}

export interface Benchmark {
	occupationId: string;
	occupationName: string;
	occupationSlug: string;
	experienceLevel: string;
	locationId: string | null;
	locationLabel: string | null;
	currency: string;
	source: BenchmarkSource;
	p10: number;
	p25: number;
	p50: number;
	p75: number;
	p90: number;
	sampleSize: number;
	refreshedAt: Date;
}

/** `db.execute` requires an index signature on its row type. */
interface BenchmarkRow extends Record<string, unknown> {
	occupation_id: string;
	occupation_name: string;
	occupation_slug: string;
	experience_level: string;
	location_id: string | null;
	location_label: string | null;
	currency: string;
	source: string;
	p10: number;
	p25: number;
	p50: number;
	p75: number;
	p90: number;
	sample_size: number;
	refreshed_at: string | Date;
}

function toBenchmark(row: BenchmarkRow): Benchmark {
	return {
		occupationId: row.occupation_id,
		occupationName: row.occupation_name,
		occupationSlug: row.occupation_slug,
		experienceLevel: row.experience_level,
		locationId: row.location_id,
		locationLabel: row.location_label,
		currency: row.currency,
		source: row.source as BenchmarkSource,
		p10: Number(row.p10),
		p25: Number(row.p25),
		p50: Number(row.p50),
		p75: Number(row.p75),
		p90: Number(row.p90),
		sampleSize: Number(row.sample_size),
		// `db.execute` returns raw driver rows, so a timestamp arrives as a string.
		refreshedAt: new Date(row.refreshed_at)
	};
}

/**
 * Rebuild the benchmark table.
 *
 * Wholesale rather than incremental, and inside one transaction: a reader either
 * sees the previous complete set or the new one, never a half-rebuilt table where
 * some roles have figures and others have vanished.
 *
 * Both sources are aggregated by the same expression, so "the median for a senior
 * backend engineer in London" means one thing regardless of which column it came
 * from.
 */
export async function refreshBenchmarks(): Promise<{ advertised: number; reported: number }> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`delete from comp_benchmarks`);

		/*
		 * Advertised pay, from live listings.
		 *
		 * The midpoint of each range rather than its floor or ceiling: a company
		 * posting 100–200k is not offering 100k, and taking the floor would let a
		 * wide range drag the whole market down. Grouped by location as well as
		 * role, with a second pass for the location-agnostic figure.
		 */
		const advertised = await tx.execute<{ written: number }>(sql`
			with live as (
				select
					j.occupation_id,
					j.experience_level,
					j.salary_currency as currency,
					jl.location_id,
					${annualise(sql`((j.salary_min + j.salary_max) / 2.0)`, sql`j.salary_period`)} as annual
				from jobs j
				left join job_locations jl on jl.job_id = j.id
				where j.status = 'published'
					and j.deleted_at is null
					and j.occupation_id is not null
					and (j.closes_at is null or j.closes_at > now())
			),
			-- Per location, and again with the location collapsed to null. One pass
			-- with grouping sets rather than two queries, so a listing is measured
			-- identically in both and a remote figure cannot drift from its city's.
			grouped as (
				select
					occupation_id, experience_level, currency,
					case when grouping(location_id) = 1 then null else location_id end as location_id,
					percentile_cont(0.10) within group (order by annual) as p10,
					percentile_cont(0.25) within group (order by annual) as p25,
					percentile_cont(0.50) within group (order by annual) as p50,
					percentile_cont(0.75) within group (order by annual) as p75,
					percentile_cont(0.90) within group (order by annual) as p90,
					count(*)::int as sample_size
				from live
				group by grouping sets (
					(occupation_id, experience_level, currency, location_id),
					(occupation_id, experience_level, currency)
				)
			)
			insert into comp_benchmarks (
				occupation_id, experience_level, location_id, currency, source,
				p10, p25, p50, p75, p90, sample_size
			)
			select
				occupation_id, experience_level, location_id, currency, 'advertised',
				p10::int, p25::int, p50::int, p75::int, p90::int, sample_size
			from grouped
			-- Under-sized groups are never written, so "no row" is the only way a
			-- caller can encounter "not enough data".
			where sample_size >= ${MIN_SAMPLE}
			returning 1 as written
		`);

		/* Reported pay, from what people told us they earn. Same shape, own source. */
		const reported = await tx.execute<{ written: number }>(sql`
			with said as (
				select
					s.occupation_id,
					s.experience_level,
					s.salary_currency as currency,
					s.location_id,
					${annualise(sql`s.salary_amount`, sql`s.salary_period`)} as annual
				from salary_submissions s
				where s.occupation_id is not null
			),
			grouped as (
				select
					occupation_id, experience_level, currency,
					case when grouping(location_id) = 1 then null else location_id end as location_id,
					percentile_cont(0.10) within group (order by annual) as p10,
					percentile_cont(0.25) within group (order by annual) as p25,
					percentile_cont(0.50) within group (order by annual) as p50,
					percentile_cont(0.75) within group (order by annual) as p75,
					percentile_cont(0.90) within group (order by annual) as p90,
					count(*)::int as sample_size
				from said
				group by grouping sets (
					(occupation_id, experience_level, currency, location_id),
					(occupation_id, experience_level, currency)
				)
			)
			insert into comp_benchmarks (
				occupation_id, experience_level, location_id, currency, source,
				p10, p25, p50, p75, p90, sample_size
			)
			select
				occupation_id, experience_level, location_id, currency, 'reported',
				p10::int, p25::int, p50::int, p75::int, p90::int, sample_size
			from grouped
			where sample_size >= ${MIN_SAMPLE}
			returning 1 as written
		`);

		return { advertised: advertised.length, reported: reported.length };
	});
}

const SELECT_BENCHMARK = sql`
	select
		b.occupation_id, o.name as occupation_name, o.slug as occupation_slug,
		b.experience_level, b.location_id,
		case when l.id is null then null else l.city || ', ' || l.country end as location_label,
		b.currency, b.source, b.p10, b.p25, b.p50, b.p75, b.p90, b.sample_size, b.refreshed_at
	from comp_benchmarks b
	join occupations o on o.id = b.occupation_id
	left join locations l on l.id = b.location_id
`;

/**
 * The benchmark for one role, if there is one.
 *
 * Falls back from "this role, this city" to "this role, anywhere" — a listing in
 * a city too small to have its own figure is better served by the national one
 * than by nothing. Never falls back across currency or across source, because
 * both of those would change what the number means rather than how precise it is.
 */
export async function benchmarkFor(options: {
	occupationId: string;
	experienceLevel: string;
	locationId?: string | null;
	currency: string;
	source?: BenchmarkSource;
}): Promise<Benchmark | null> {
	const source = options.source ?? 'advertised';

	const rows = await db.execute<BenchmarkRow>(sql`
		${SELECT_BENCHMARK}
		where b.occupation_id = ${options.occupationId}
			and b.experience_level = ${options.experienceLevel}
			and b.currency = ${options.currency}
			and b.source = ${source}
			and (b.location_id is null or b.location_id = ${options.locationId ?? null})
		-- The city figure when it exists, otherwise the everywhere one.
		order by b.location_id nulls last
		limit 1
	`);

	return rows[0] ? toBenchmark(rows[0]) : null;
}

/** Every published benchmark, for the explorer. */
export async function listBenchmarks(source: BenchmarkSource = 'advertised'): Promise<Benchmark[]> {
	const rows = await db.execute<BenchmarkRow>(sql`
		${SELECT_BENCHMARK}
		where b.source = ${source} and b.location_id is null
		order by o.name, b.experience_level
	`);

	return rows.map(toBenchmark);
}

/** Every level published for one occupation, city figures included. */
export async function benchmarksForOccupation(
	slug: string,
	source: BenchmarkSource = 'advertised'
): Promise<Benchmark[]> {
	const rows = await db.execute<BenchmarkRow>(sql`
		${SELECT_BENCHMARK}
		where o.slug = ${slug} and b.source = ${source}
		order by b.experience_level, b.location_id nulls first
	`);

	return rows.map(toBenchmark);
}

export interface MarketPosition {
	/** Where the listing's midpoint falls, 0–100, against p10–p90. */
	percentile: number;
	/** Percent above or below the median. Negative is below. */
	differenceFromMedian: number;
	/** The listing's own annualised midpoint, so a caller can plot it. */
	annualMidpoint: number;
	benchmark: Benchmark;
}

/**
 * The TypeScript twin of `annualise`.
 *
 * Two spellings of one convention is how a marker ends up plotted against a scale
 * it was not measured on, so both live here, next to each other, and a change to
 * one is an obvious prompt to change the other.
 */
export function annualMultiplier(period: string): number {
	if (period === 'hour') return 2080;
	if (period === 'day') return 260;
	if (period === 'month') return 12;
	return 1;
}

/**
 * Where one listing sits against its market.
 *
 * Compares midpoint to midpoint. Comparing a range's ceiling to a market median
 * is how every job becomes "above market" — the top of a range is what one person
 * might get, not what the role pays.
 */
export function positionAgainst(
	job: { salaryMin: number; salaryMax: number; salaryPeriod: string },
	benchmark: Benchmark
): MarketPosition {
	const midpoint = ((job.salaryMin + job.salaryMax) / 2) * annualMultiplier(job.salaryPeriod);

	// Interpolated across the published points rather than the full distribution,
	// which is not stored. Clamped, so a wild outlier reads as "top of the market"
	// rather than as a 400th percentile.
	const points: [number, number][] = [
		[benchmark.p10, 10],
		[benchmark.p25, 25],
		[benchmark.p50, 50],
		[benchmark.p75, 75],
		[benchmark.p90, 90]
	];

	let percentile = midpoint <= benchmark.p10 ? 10 : 90;
	for (let i = 0; i < points.length - 1; i++) {
		const [lowValue, lowRank] = points[i];
		const [highValue, highRank] = points[i + 1];
		if (midpoint >= lowValue && midpoint <= highValue) {
			const span = highValue - lowValue;
			const within = span === 0 ? 0 : (midpoint - lowValue) / span;
			percentile = lowRank + within * (highRank - lowRank);
			break;
		}
	}

	return {
		percentile: Math.round(percentile),
		differenceFromMedian: Math.round(((midpoint - benchmark.p50) / benchmark.p50) * 100),
		annualMidpoint: Math.round(midpoint),
		benchmark
	};
}

/**
 * How a position is worded.
 *
 * Keyed to the **percentile**, not to the percent difference from the median,
 * because the percentile is what the chart beside it draws — and the two disagree
 * badly whenever a market is tight. A role whose whole range spans 10% puts a
 * listing at the very bottom of the distribution only 7% under the median, and
 * calling that "about the going rate" next to a marker pinned to the left-hand
 * edge tells the reader one thing in words and the opposite in a picture.
 *
 * The middle band is deliberately wide. Most listings genuinely are unremarkable,
 * and a scale that finds something to say about every one of them would teach
 * employers that publishing a range invites a verdict — which would end with them
 * not publishing one.
 *
 * It is **one claim, counted in jobs**. The earlier version added "it is 2% above
 * the middle" after the verdict, and beside "towards the top of the range" that
 * reads as a contradiction — the two numbers measure different things and a reader
 * has no reason to know which one the chart is drawing. Counting jobs says the same
 * thing the marker on the bar says, in the same units as everything around it.
 */
export function describePosition(position: MarketPosition): string {
	const { percentile } = position;

	// Rounded to whole jobs out of ten, and clamped off the ends: "more than 10 in
	// 10" is not a sentence, and the sample is never big enough to justify it.
	const outOfTen = Math.min(9, Math.max(1, Math.round(percentile / 10)));

	if (percentile >= 75) {
		return `Pays more than about ${outOfTen} in 10 jobs like it.`;
	}

	if (percentile >= 35) {
		return `About the going rate — it pays more than about ${outOfTen} in 10 jobs like it.`;
	}

	return `On the low side — about ${10 - outOfTen} in 10 jobs like it pay more.`;
}

/**
 * Record what somebody says they are paid.
 *
 * Accepted without an account on purpose. Requiring one narrows the data to
 * people who already found work through this product, which is the least
 * interesting group to ask and would quietly bias every figure on the page
 * towards the jobs already listed here.
 *
 * Nothing is verified, and the pages that show it say so rather than implying a
 * check that never happened. What protects the figures is not authentication:
 * it is the minimum sample, the rate limit on the caller, and the fact that
 * advertised and reported pay are published separately, so a stuffed reported
 * figure cannot move the advertised one.
 *
 * The submission does not appear anywhere until the next rebuild. That is worth
 * saying to the person who submitted it — a figure that does not move looks like
 * a form that did not work.
 */
export async function report(
	input: SalaryReportInput,
	userId: string | null
): Promise<SalarySubmission> {
	const [row] = await db
		.insert(salarySubmissions)
		.values({
			userId,
			jobTitle: input.jobTitle,
			occupationId: input.occupationId,
			experienceLevel: input.experienceLevel,
			// An empty select means "did not say", which is null in the row rather
			// than an empty string the aggregation would try to join on.
			locationId: input.locationId || null,
			salaryAmount: input.salaryAmount,
			salaryCurrency: input.salaryCurrency,
			salaryPeriod: input.salaryPeriod,
			yearsOfExperience: input.yearsOfExperience ?? null
		})
		.returning();

	return row;
}

/**
 * How many reports are already in this person's group, and whether that is
 * enough to publish.
 *
 * Shown back after submitting, because the alternative is a thank-you note beside
 * a page that has not changed — which reads as the form having failed.
 */
export async function reportContext(
	occupationId: string,
	experienceLevel: ExperienceLevel
): Promise<{ reports: number; publishes: boolean; needed: number }> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(salarySubmissions)
		.where(
			and(
				eq(salarySubmissions.occupationId, occupationId),
				eq(salarySubmissions.experienceLevel, experienceLevel)
			)
		);

	const reports = row?.count ?? 0;
	return {
		reports,
		publishes: reports >= MIN_SAMPLE,
		needed: Math.max(0, MIN_SAMPLE - reports)
	};
}
