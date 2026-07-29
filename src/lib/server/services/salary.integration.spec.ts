import { asc } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '../db';
import { occupations } from '../db/schema/taxonomy';
import { databaseReachable } from '../testing/fixtures';
import {
	MIN_SAMPLE,
	benchmarkFor,
	describePosition,
	listBenchmarks,
	positionAgainst,
	refreshBenchmarks,
	report,
	reportContext,
	type Benchmark
} from './salary';

/**
 * A benchmark with round numbers, for the pure position maths.
 *
 * Built by hand rather than read back from the database: `positionAgainst` and
 * `describePosition` are the two pieces a reader actually sees, and testing them
 * against a fixed distribution says exactly what they do.
 */
function benchmark(overrides: Partial<Benchmark> = {}): Benchmark {
	return {
		occupationId: 'occupation',
		occupationName: 'Backend Engineer',
		occupationSlug: 'backend-engineer',
		experienceLevel: 'senior',
		locationId: null,
		locationLabel: null,
		currency: 'USD',
		source: 'advertised',
		p10: 100_000,
		p25: 120_000,
		p50: 150_000,
		p75: 180_000,
		p90: 200_000,
		sampleSize: 40,
		refreshedAt: new Date(),
		...overrides
	};
}

describe('where a listing sits against its market', () => {
	it('puts a listing paying the median at the middle', () => {
		const position = positionAgainst(
			{ salaryMin: 140_000, salaryMax: 160_000, salaryPeriod: 'year' },
			benchmark()
		);

		expect(position.percentile).toBe(50);
		expect(position.differenceFromMedian).toBe(0);
		expect(position.annualMidpoint).toBe(150_000);
	});

	it('compares midpoints, not the top of the range', () => {
		// Comparing a range's ceiling to a market median is how every job becomes
		// "above market" — the top of a range is what one person might get.
		const position = positionAgainst(
			{ salaryMin: 100_000, salaryMax: 200_000, salaryPeriod: 'year' },
			benchmark()
		);

		expect(position.annualMidpoint).toBe(150_000);
		expect(position.differenceFromMedian).toBe(0);
	});

	it('annualises an hourly rate before comparing', () => {
		// Dropped in raw, an hourly rate lands next to nothing and every listing
		// looks like it pays a rounding error.
		const position = positionAgainst(
			{ salaryMin: 72, salaryMax: 72, salaryPeriod: 'hour' },
			benchmark()
		);

		expect(position.annualMidpoint).toBe(72 * 2080);
	});

	it('clamps an outlier rather than reporting a 400th percentile', () => {
		const high = positionAgainst(
			{ salaryMin: 900_000, salaryMax: 900_000, salaryPeriod: 'year' },
			benchmark()
		);
		const low = positionAgainst(
			{ salaryMin: 10_000, salaryMax: 10_000, salaryPeriod: 'year' },
			benchmark()
		);

		expect(high.percentile).toBe(90);
		expect(low.percentile).toBe(10);
	});

	it('words the verdict from the percentile the chart draws', () => {
		// The regression this guards: in a tight market a listing at the very bottom
		// of the distribution sits only a few percent under the median, and wording
		// keyed to that percentage called it "about the going rate" while the marker
		// beside it was pinned to the left-hand edge.
		const tight = benchmark({ p10: 98_000, p25: 99_000, p50: 100_000, p75: 101_000, p90: 102_000 });

		const bottom = positionAgainst(
			{ salaryMin: 98_000, salaryMax: 98_000, salaryPeriod: 'year' },
			tight
		);

		expect(bottom.percentile).toBeLessThan(35);
		expect(Math.abs(bottom.differenceFromMedian)).toBeLessThan(10);
		expect(describePosition(bottom)).toMatch(/low side/i);
	});

	it('calls an unremarkable listing unremarkable', () => {
		const position = positionAgainst(
			{ salaryMin: 145_000, salaryMax: 155_000, salaryPeriod: 'year' },
			benchmark()
		);

		expect(describePosition(position)).toMatch(/going rate/i);
	});

	it('says so when a listing is at the top', () => {
		const position = positionAgainst(
			{ salaryMin: 190_000, salaryMax: 190_000, salaryPeriod: 'year' },
			benchmark()
		);

		expect(describePosition(position)).toMatch(/pays more than/i);
	});

	it('counts in jobs rather than quoting two numbers that disagree', () => {
		// The other half of the same regression, on the readable side. A listing can
		// be near the top of a tight market and barely above its median, and saying
		// both — "towards the top of the range. It is 2% above the middle." — left a
		// reader with two figures, no way to tell which the chart drew, and the
		// impression the page was contradicting itself.
		const tight = benchmark({ p10: 98_000, p25: 99_000, p50: 100_000, p75: 101_000, p90: 102_000 });

		const summary = describePosition(
			positionAgainst({ salaryMin: 102_000, salaryMax: 102_000, salaryPeriod: 'year' }, tight)
		);

		expect(summary).toMatch(/in 10 jobs/i);
		expect(summary).not.toMatch(/% (above|below)/i);
	});
});

describe.skipIf(!databaseReachable)('building the benchmarks', () => {
	it('never publishes a group below the minimum sample', async () => {
		await refreshBenchmarks();

		const published = await listBenchmarks('advertised');

		// Under-sized groups are not written at all, so a missing row and "not
		// enough data" are the same thing and no caller can render a median built
		// from three numbers by forgetting a check.
		for (const row of published) {
			expect(row.sampleSize).toBeGreaterThanOrEqual(MIN_SAMPLE);
		}
	});

	it('keeps advertised and reported figures apart', async () => {
		await refreshBenchmarks();

		const advertised = await listBenchmarks('advertised');
		const reported = await listBenchmarks('reported');

		// What a company advertises and what people say they take home are different
		// measurements. A number that is secretly half of each describes nothing.
		expect(advertised.every((row) => row.source === 'advertised')).toBe(true);
		expect(reported.every((row) => row.source === 'reported')).toBe(true);
	});

	it('does not answer for a currency it has no data in', async () => {
		await refreshBenchmarks();

		const published = await listBenchmarks('advertised');
		if (published.length === 0) return;

		// There is no exchange rate in this product. Falling back across currency
		// would be inventing one, which is the most misleading thing this page could
		// do.
		const found = await benchmarkFor({
			occupationId: published[0].occupationId,
			experienceLevel: published[0].experienceLevel,
			currency: 'JPY'
		});

		expect(found).toBeNull();
	});

	it('rebuilds rather than accumulating', async () => {
		const first = await refreshBenchmarks();
		const second = await refreshBenchmarks();

		// The refresh clears each source and rewrites it inside one transaction, so
		// running it twice leaves the same table rather than a doubled one.
		expect(second.advertised).toBe(first.advertised);
		expect(second.reported).toBe(first.reported);
	});
});

describe.skipIf(!databaseReachable)('reporting your own pay', () => {
	async function anOccupation(): Promise<string> {
		const [row] = await db
			.select({ id: occupations.id })
			.from(occupations)
			.orderBy(asc(occupations.name))
			.limit(1);
		return row.id;
	}

	it('accepts a report from nobody in particular', async () => {
		const occupationId = await anOccupation();

		// No account required. Requiring one narrows the data to people who already
		// found work through this product, which would bias every published figure
		// towards the jobs already listed here.
		const submission = await report(
			{
				jobTitle: 'Staff Backend Engineer',
				occupationId,
				experienceLevel: 'staff',
				locationId: '',
				salaryAmount: 196_000,
				salaryCurrency: 'USD',
				salaryPeriod: 'year'
			},
			null
		);

		expect(submission.userId).toBeNull();
		// An empty select is "did not say", which is null rather than an empty string
		// the aggregation would try to join on.
		expect(submission.locationId).toBeNull();
		expect(submission.verifiedAt).toBeNull();
	});

	it('does not count as verified just because somebody was signed in', async () => {
		const occupationId = await anOccupation();

		const submission = await report(
			{
				jobTitle: 'Backend Engineer',
				occupationId,
				experienceLevel: 'mid',
				locationId: '',
				salaryAmount: 120_000,
				salaryCurrency: 'USD',
				salaryPeriod: 'year'
			},
			null
		);

		// A "verified" badge that means "we did not check" is worse than no badge.
		expect(submission.verifiedAt).toBeNull();
	});

	it('reports how far a group is from being publishable', async () => {
		const occupationId = await anOccupation();
		const context = await reportContext(occupationId, 'staff');

		expect(context.publishes).toBe(context.reports >= MIN_SAMPLE);
		if (!context.publishes) {
			expect(context.reports + context.needed).toBe(MIN_SAMPLE);
		} else {
			expect(context.needed).toBe(0);
		}
	});
});
