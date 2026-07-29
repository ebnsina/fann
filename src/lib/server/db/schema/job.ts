import { sql } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar
} from 'drizzle-orm/pg-core';
import { baseColumns, baseSoftDeleteColumns, tsvector } from './_shared';
import { companies } from './company';
import { organizations } from './org';
import { locations, occupations, skills } from './taxonomy';
import { users } from './identity';

export const employmentTypeEnum = pgEnum('employment_type', [
	'full_time',
	'part_time',
	'contract',
	'temporary',
	'internship'
]);

/** Where the work happens. Distinct from location — see the note in taxonomy.ts. */
export const workModeEnum = pgEnum('work_mode', ['onsite', 'hybrid', 'remote']);

export const experienceLevelEnum = pgEnum('experience_level', [
	'internship',
	'entry',
	'mid',
	'senior',
	'staff',
	'principal',
	'executive'
]);

export const jobStatusEnum = pgEnum('job_status', [
	'draft',
	'pending_review',
	'published',
	'paused',
	'closed',
	'archived'
]);

export const salaryPeriodEnum = pgEnum('salary_period', ['hour', 'day', 'month', 'year']);

export const jobs = pgTable(
	'jobs',
	{
		...baseSoftDeleteColumns,
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		companyId: uuid('company_id')
			.notNull()
			.references(() => companies.id, { onDelete: 'cascade' }),

		title: text('title').notNull(),
		slug: text('slug').notNull(),
		/** Markdown, sanitized on render. */
		description: text('description').notNull(),

		employmentType: employmentTypeEnum('employment_type').notNull().default('full_time'),
		workMode: workModeEnum('work_mode').notNull().default('onsite'),
		experienceLevel: experienceLevelEnum('experience_level').notNull().default('mid'),
		occupationId: uuid('occupation_id').references(() => occupations.id, { onDelete: 'set null' }),

		/**
		 * Salary is NOT NULL by design — pay transparency is enforced by the schema,
		 * not by a policy someone can forget. A job that cannot state a range cannot
		 * be posted here.
		 */
		salaryMin: integer('salary_min').notNull(),
		salaryMax: integer('salary_max').notNull(),
		salaryCurrency: varchar('salary_currency', { length: 3 }).notNull().default('USD'),
		salaryPeriod: salaryPeriodEnum('salary_period').notNull().default('year'),
		/** Free text, e.g. "0.05%–0.15%". Optional; equity is not universal. */
		equityRange: text('equity_range'),

		status: jobStatusEnum('status').notNull().default('draft'),
		publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
		closesAt: timestamp('closes_at', { withTimezone: true, mode: 'date' }),
		createdByUserId: uuid('created_by_user_id').references(() => users.id, {
			onDelete: 'set null'
		}),

		/** Employer's promise, published on the listing and measured against. */
		responseSlaDays: integer('response_sla_days'),
		applicantCount: integer('applicant_count').notNull().default(0),
		viewCount: integer('view_count').notNull().default(0),

		/**
		 * Generated, so it can never drift from the row it describes. Title is
		 * weighted 'A' and description 'D' — a keyword in the title should outrank
		 * the same keyword buried in a paragraph.
		 */
		searchVector: tsvector('search_vector').generatedAlwaysAs(
			(): ReturnType<typeof sql> =>
				sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'D')`
		)
	},
	(table) => [
		uniqueIndex('jobs_slug_key').on(table.slug),
		// The board's default query: published jobs, newest first.
		index('jobs_status_published_idx').on(table.status, table.publishedAt),
		index('jobs_company_idx').on(table.companyId),
		index('jobs_organization_idx').on(table.organizationId),
		index('jobs_occupation_idx').on(table.occupationId),
		// Full-text ranking.
		index('jobs_search_vector_idx').using('gin', table.searchVector),
		// Typo-tolerant title matching and autocomplete.
		index('jobs_title_trgm_idx').using('gin', sql`${table.title} gin_trgm_ops`)
	]
);

export const jobLocations = pgTable(
	'job_locations',
	{
		...baseColumns,
		jobId: uuid('job_id')
			.notNull()
			.references(() => jobs.id, { onDelete: 'cascade' }),
		locationId: uuid('location_id')
			.notNull()
			.references(() => locations.id, { onDelete: 'cascade' })
	},
	(table) => [
		uniqueIndex('job_locations_key').on(table.jobId, table.locationId),
		index('job_locations_location_idx').on(table.locationId)
	]
);

export const jobSkills = pgTable(
	'job_skills',
	{
		...baseColumns,
		jobId: uuid('job_id')
			.notNull()
			.references(() => jobs.id, { onDelete: 'cascade' }),
		skillId: uuid('skill_id')
			.notNull()
			.references(() => skills.id, { onDelete: 'cascade' }),
		/** Required skills gate matching; the rest only inform ranking. */
		required: boolean('required').notNull().default(false)
	},
	(table) => [
		uniqueIndex('job_skills_key').on(table.jobId, table.skillId),
		index('job_skills_skill_idx').on(table.skillId)
	]
);

export const screeningQuestionTypeEnum = pgEnum('screening_question_type', [
	'text',
	'boolean',
	'single_choice',
	'multi_choice',
	'number'
]);

export const jobScreeningQuestions = pgTable(
	'job_screening_questions',
	{
		...baseColumns,
		jobId: uuid('job_id')
			.notNull()
			.references(() => jobs.id, { onDelete: 'cascade' }),
		question: text('question').notNull(),
		type: screeningQuestionTypeEnum('type').notNull().default('text'),
		/** Choices for single/multi choice questions. */
		options: text('options').array().notNull().default([]),
		required: boolean('required').notNull().default(false),
		/**
		 * A wrong answer auto-rejects. Deliberately explicit and separate from
		 * `required` — knockouts are the one place a machine ends someone's
		 * application, so it should never be a side effect of another flag.
		 */
		knockout: boolean('knockout').notNull().default(false),
		/** The answer that passes a knockout check, as JSON text. */
		expectedAnswer: text('expected_answer'),
		position: integer('position').notNull().default(0)
	},
	(table) => [index('job_screening_questions_job_idx').on(table.jobId)]
);

/** Candidate bookmarks. Also a demand signal for the employer. */
export const savedJobs = pgTable(
	'saved_jobs',
	{
		...baseColumns,
		jobId: uuid('job_id')
			.notNull()
			.references(() => jobs.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' })
	},
	(table) => [
		uniqueIndex('saved_jobs_key').on(table.jobId, table.userId),
		index('saved_jobs_user_idx').on(table.userId)
	]
);

export type Job = typeof jobs.$inferSelect;
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export type WorkMode = (typeof workModeEnum.enumValues)[number];
export type EmploymentType = (typeof employmentTypeEnum.enumValues)[number];
export type ExperienceLevel = (typeof experienceLevelEnum.enumValues)[number];
