import * as v from 'valibot';
import { asc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { form, getRequestEvent, query } from '$app/server';
import { db } from '#lib/server/db';
import { locations, occupations } from '#lib/server/db/schema/taxonomy';
import { RULES, enforce } from '#lib/server/rate-limit';
import * as salary from '#lib/server/services/salary';
import { salaryReportSchema } from '#lib/schemas/salary';

const sourceSchema = v.optional(v.picklist(['advertised', 'reported'] as const), 'advertised');

/**
 * Every published benchmark, for the explorer.
 *
 * Only the location-agnostic rows: a landing view that mixed "senior backend
 * engineer" with "senior backend engineer in Berlin" would double-count the same
 * jobs under two headings that look like peers.
 */
export const payBenchmarks = query(sourceSchema, async (source) => {
	const benchmarks = await salary.listBenchmarks(source);

	return {
		source,
		benchmarks,
		// The reader is owed the date. A benchmark with no "as of" is a number
		// pretending to be timeless, and this one moves every night.
		refreshedAt: benchmarks[0]?.refreshedAt ?? null
	};
});

export const payForOccupation = query(
	v.object({ slug: v.string(), source: sourceSchema }),
	async ({ slug, source }) => {
		const all = await salary.benchmarksForOccupation(slug, source);
		if (all.length === 0) error(404, 'Not found.');

		return {
			source,
			name: all[0].occupationName,
			slug: all[0].occupationSlug,
			/** The headline figures, one per level. */
			overall: all.filter((row) => row.locationId === null),
			/** Where a city has enough of its own data to say something different. */
			byLocation: all.filter((row) => row.locationId !== null),
			refreshedAt: all[0].refreshedAt
		};
	}
);

/** The lists the report form picks from. Two small queries, cached as one. */
export const reportOptions = query(async () => {
	const [occupationRows, locationRows] = await Promise.all([
		db
			.select({ id: occupations.id, name: occupations.name, category: occupations.category })
			.from(occupations)
			.orderBy(asc(occupations.name)),
		db
			.select({ id: locations.id, city: locations.city, country: locations.country })
			.from(locations)
			.orderBy(asc(locations.city))
	]);

	return { occupations: occupationRows, locations: locationRows };
});

/**
 * Report your own pay.
 *
 * No account required — see `salary.report` for why. The rate limit is keyed to
 * the address rather than to a user for the same reason: there is no user to key
 * it to, and this endpoint moves numbers the whole site publishes.
 */
export const reportSalary = form(salaryReportSchema, async (input) => {
	const { locals, getClientAddress } = getRequestEvent();

	await enforce(RULES.salaryReport, [`ip:${getClientAddress()}`]);

	// A submission from a signed-in person is still not verified. The id is kept so
	// somebody can be told what they reported, never as a claim that we checked it.
	await salary.report(input, locals.user?.id ?? null);

	const context = await salary.reportContext(input.occupationId, input.experienceLevel);

	// The figures only move on the next rebuild. Saying so beats a thank-you note
	// beside a page that has not changed, which reads as the form having failed.
	return { saved: true, ...context };
});
