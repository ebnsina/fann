import { index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { baseColumns } from './_shared';
import { companies } from './company';
import { experienceLevelEnum, salaryPeriodEnum } from './job';
import { users } from './identity';
import { locations, occupations } from './taxonomy';

/**
 * Pay data, and what is computed from it.
 *
 * The product's argument is that a salary you can see beats one you cannot. The
 * obvious next question — "is that number any good?" — is what this answers, and
 * answering it badly is worse than not answering: a benchmark built from four
 * reports is a rumour with a decimal point.
 *
 * Two sources feed it, and they are kept apart on purpose:
 *
 *   - **Published job ranges.** Every job here carries one, so this is a census
 *     rather than a sample. It measures what companies advertise.
 *   - **Submissions.** What people say they are actually paid, which is a
 *     different thing and usually a smaller number.
 *
 * Mixing them silently would produce a figure that is neither. `source` on the
 * benchmark says which one a reader is looking at.
 */

export const salarySubmissions = pgTable(
	'salary_submissions',
	{
		...baseColumns,

		/**
		 * Nullable: a person may report their pay without an account.
		 *
		 * Requiring one would bias the data towards people already hired through
		 * this product, which is the least interesting group to ask.
		 */
		userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

		/** Free text as typed, kept for display; `occupationId` is what groups it. */
		jobTitle: text('job_title').notNull(),
		occupationId: uuid('occupation_id').references(() => occupations.id, { onDelete: 'set null' }),
		experienceLevel: experienceLevelEnum('experience_level').notNull(),
		locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),

		/** Optional — plenty of people will report pay but not their employer. */
		companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),

		/** Stored as given; annualised in SQL wherever it is compared. */
		salaryAmount: integer('salary_amount').notNull(),
		salaryCurrency: varchar('salary_currency', { length: 3 }).notNull().default('USD'),
		salaryPeriod: salaryPeriodEnum('salary_period').notNull().default('year'),
		yearsOfExperience: integer('years_of_experience'),

		/**
		 * Whether we have any reason to believe this beyond it being typed in.
		 *
		 * Nothing sets it yet, and it is deliberately not shown as a badge until
		 * something does — a "verified" label that means "we did not check" is worse
		 * than no label, and is the exact habit this product exists to break.
		 */
		verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		index('salary_submissions_group_idx').on(
			table.occupationId,
			table.experienceLevel,
			table.locationId
		),
		index('salary_submissions_company_idx').on(table.companyId)
	]
);

/**
 * A refreshed aggregate, one row per group we can say anything about.
 *
 * Materialised rather than computed per request: the percentiles are a sort over
 * every matching row, and a job page that recomputed them on every view would be
 * doing that work for a figure that changes once a night.
 *
 * Groups below the minimum sample are **not written at all**, so a missing row and
 * "not enough data" are the same thing and no caller can accidentally render a
 * percentile built from three numbers.
 */
export const compBenchmarks = pgTable(
	'comp_benchmarks',
	{
		...baseColumns,

		occupationId: uuid('occupation_id')
			.notNull()
			.references(() => occupations.id, { onDelete: 'cascade' }),
		experienceLevel: experienceLevelEnum('experience_level').notNull(),
		/** Null means "everywhere" — the country-agnostic figure for remote roles. */
		locationId: uuid('location_id').references(() => locations.id, { onDelete: 'cascade' }),
		currency: varchar('currency', { length: 3 }).notNull(),
		/** `advertised` (job ranges) or `reported` (submissions). Never blended. */
		source: text('source').notNull(),

		/** All annualised, in `currency`. */
		p10: integer('p10').notNull(),
		p25: integer('p25').notNull(),
		p50: integer('p50').notNull(),
		p75: integer('p75').notNull(),
		p90: integer('p90').notNull(),
		sampleSize: integer('sample_size').notNull(),

		refreshedAt: timestamp('refreshed_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		// Plain indexes, not a unique key. `refreshBenchmarks` clears a source and
		// rebuilds it inside one transaction, so there is no upsert needing a
		// conflict target — which is just as well, since `locationId` is null for the
		// "everywhere" figure and Postgres counts every null as distinct.
		index('comp_benchmarks_lookup_idx').on(table.occupationId, table.experienceLevel, table.source),
		index('comp_benchmarks_source_idx').on(table.source, table.currency)
	]
);

export type SalarySubmission = typeof salarySubmissions.$inferSelect;
export type CompBenchmark = typeof compBenchmarks.$inferSelect;
