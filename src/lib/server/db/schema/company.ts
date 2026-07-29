import { sql } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { baseColumns, baseSoftDeleteColumns } from './_shared';
import { organizations } from './org';
import { industries, locations } from './taxonomy';

/** Headcount bands rather than an exact number, which is always stale. */
export const companySizeEnum = pgEnum('company_size', [
	'1-10',
	'11-50',
	'51-200',
	'201-500',
	'501-1000',
	'1001-5000',
	'5000+'
]);

/**
 * The public face of an organization.
 *
 * Separate from `organizations` because that is the tenancy boundary — members,
 * billing, permissions — while this is marketing copy that candidates read. They
 * change for different reasons and are edited by different people.
 */
export const companies = pgTable(
	'companies',
	{
		...baseSoftDeleteColumns,
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		slug: text('slug').notNull(),
		tagline: text('tagline'),
		/** Markdown. Rendered through a sanitizer, never with raw `{@html}`. */
		about: text('about'),
		websiteUrl: text('website_url'),
		logoFileId: uuid('logo_file_id'),
		size: companySizeEnum('size'),
		/**
		 * Whether people outside the company may like or comment on its posts.
		 *
		 * The company's decision, not ours. A team that does not want a public
		 * comment thread under its updates should not have to choose between that
		 * and not posting at all — and a thread nobody is willing to moderate is
		 * worse for everyone than no thread. Default open, because a feed where
		 * nothing can be replied to is a noticeboard.
		 */
		allowsInteraction: boolean('allows_interaction').notNull().default(true),
		foundedYear: integer('founded_year'),
		industryId: uuid('industry_id').references(() => industries.id, { onDelete: 'set null' }),
		headquartersLocationId: uuid('headquarters_location_id').references(() => locations.id, {
			onDelete: 'set null'
		})
	},
	(table) => [
		uniqueIndex('companies_slug_key').on(table.slug),
		// One public profile per organization.
		uniqueIndex('companies_organization_key').on(table.organizationId),
		index('companies_name_trgm_idx').using('gin', sql`${table.name} gin_trgm_ops`)
	]
);

/** Offices a company hires into, beyond the headquarters. */
export const companyLocations = pgTable(
	'company_locations',
	{
		...baseColumns,
		companyId: uuid('company_id')
			.notNull()
			.references(() => companies.id, { onDelete: 'cascade' }),
		locationId: uuid('location_id')
			.notNull()
			.references(() => locations.id, { onDelete: 'cascade' })
	},
	(table) => [
		uniqueIndex('company_locations_key').on(table.companyId, table.locationId),
		index('company_locations_company_idx').on(table.companyId)
	]
);

export const companyBenefits = pgTable(
	'company_benefits',
	{
		...baseColumns,
		companyId: uuid('company_id')
			.notNull()
			.references(() => companies.id, { onDelete: 'cascade' }),
		label: text('label').notNull(),
		description: text('description'),
		/** Display order, controlled by the employer. */
		position: integer('position').notNull().default(0)
	},
	(table) => [index('company_benefits_company_idx').on(table.companyId)]
);

export type Company = typeof companies.$inferSelect;

/**
 * Slugs a company used to have.
 *
 * A company URL is public and already linked from every one of its job pages,
 * from search results, and from wherever anybody has shared it. Letting a rename
 * change the slug without this would break all of those silently — the page would
 * simply 404 and nothing would say why.
 *
 * Rows are never removed. An old link is expected to keep working indefinitely;
 * "we stopped honouring that address after a year" is the same failure arriving
 * later.
 */
export const companySlugHistory = pgTable(
	'company_slug_history',
	{
		...baseColumns,
		companyId: uuid('company_id')
			.notNull()
			.references(() => companies.id, { onDelete: 'cascade' }),
		slug: text('slug').notNull()
	},
	(table) => [
		// A retired slug must not be claimable by a different company, so this is
		// unique across the whole table rather than per company.
		uniqueIndex('company_slug_history_key').on(table.slug),
		index('company_slug_history_company_idx').on(table.companyId)
	]
);
