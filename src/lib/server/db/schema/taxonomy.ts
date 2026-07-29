import { doublePrecision, index, pgTable, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { baseColumns } from './_shared';

/**
 * Shared vocabularies.
 *
 * These are curated rather than free text so that filtering, matching and salary
 * benchmarking have something stable to group by. Free-text skills look flexible
 * and then quietly make "React" and "ReactJS" two different filters.
 */

export const skills = pgTable(
	'skills',
	{
		...baseColumns,
		name: text('name').notNull(),
		slug: text('slug').notNull(),
		/** Alternate spellings folded into this skill when parsing or searching. */
		aliases: text('aliases').array().notNull().default([])
	},
	(table) => [uniqueIndex('skills_slug_key').on(table.slug)]
);

/** Job families — the level salary benchmarks are computed at. */
export const occupations = pgTable(
	'occupations',
	{
		...baseColumns,
		name: text('name').notNull(),
		slug: text('slug').notNull(),
		/** Broad grouping, e.g. `engineering`, for navigation. */
		category: text('category').notNull()
	},
	(table) => [uniqueIndex('occupations_slug_key').on(table.slug)]
);

export const industries = pgTable(
	'industries',
	{
		...baseColumns,
		name: text('name').notNull(),
		slug: text('slug').notNull()
	},
	(table) => [uniqueIndex('industries_slug_key').on(table.slug)]
);

/**
 * Places, resolved to a canonical row rather than stored as strings.
 *
 * "Remote" is not a location — it is a `workMode` on the job. Conflating them is
 * why so many boards return office jobs when you filter for remote.
 */
export const locations = pgTable(
	'locations',
	{
		...baseColumns,
		city: text('city'),
		region: text('region'),
		country: text('country').notNull(),
		/** ISO 3166-1 alpha-2. */
		countryCode: varchar('country_code', { length: 2 }).notNull(),
		slug: text('slug').notNull(),
		latitude: doublePrecision('latitude'),
		longitude: doublePrecision('longitude'),
		/** IANA zone, used for interview scheduling. */
		timezone: text('timezone')
	},
	(table) => [
		uniqueIndex('locations_slug_key').on(table.slug),
		index('locations_country_idx').on(table.countryCode)
	]
);

export type Skill = typeof skills.$inferSelect;
export type Occupation = typeof occupations.$inferSelect;
export type Location = typeof locations.$inferSelect;
