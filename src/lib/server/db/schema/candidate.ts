import {
	boolean,
	date,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	uniqueIndex,
	uuid,
	varchar
} from 'drizzle-orm/pg-core';
import { baseColumns, baseSoftDeleteColumns } from './_shared';
import { users } from './identity';
import { files } from './platform';
import { locations, skills } from './taxonomy';

/**
 * How discoverable a candidate is.
 *
 * `anonymous` exists because the people most worth hiring are usually employed,
 * and a searchable profile their manager can find is a reason not to have one.
 */
export const profileVisibilityEnum = pgEnum('profile_visibility', [
	'private',
	'anonymous',
	'public'
]);

export const documentKindEnum = pgEnum('document_kind', [
	'resume',
	'cover_letter',
	'portfolio',
	'other'
]);

export const candidateProfiles = pgTable(
	'candidate_profiles',
	{
		...baseSoftDeleteColumns,
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		headline: text('headline'),
		/** Markdown, rendered through the sanitizer like every other user text. */
		summary: text('summary'),
		visibility: profileVisibilityEnum('visibility').notNull().default('private'),
		openToWork: boolean('open_to_work').notNull().default(false),

		locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
		/** Work modes the candidate will consider, e.g. `['remote','hybrid']`. */
		preferredWorkModes: text('preferred_work_modes').array().notNull().default([]),

		/** What they are looking for, in the same shape jobs publish. */
		desiredSalaryMin: integer('desired_salary_min'),
		desiredSalaryCurrency: varchar('desired_salary_currency', { length: 3 }).default('USD'),

		/** Free text — "EU citizen", "needs H-1B sponsorship". */
		workAuthorization: text('work_authorization'),
		noticePeriodDays: integer('notice_period_days'),

		/** The resume attached by default when applying. */
		defaultResumeDocumentId: uuid('default_resume_document_id'),
		websiteUrl: text('website_url'),
		linkedinUrl: text('linkedin_url'),
		githubUrl: text('github_url')
	},
	(table) => [
		uniqueIndex('candidate_profiles_user_key').on(table.userId),
		index('candidate_profiles_open_idx').on(table.openToWork, table.visibility)
	]
);

/**
 * Uploaded files a candidate owns, wrapping a row in `files`.
 *
 * Separate from `files` so the same bytes can be referenced by several
 * applications without being re-uploaded, and so deleting an application never
 * deletes the candidate's resume.
 */
export const documents = pgTable(
	'documents',
	{
		...baseColumns,
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		fileId: uuid('file_id')
			.notNull()
			.references(() => files.id, { onDelete: 'cascade' }),
		kind: documentKindEnum('kind').notNull().default('resume'),
		/** Candidate-facing name, e.g. "Resume — backend roles". */
		label: text('label').notNull()
	},
	(table) => [index('documents_user_kind_idx').on(table.userId, table.kind)]
);

export const workExperiences = pgTable(
	'work_experiences',
	{
		...baseColumns,
		profileId: uuid('profile_id')
			.notNull()
			.references(() => candidateProfiles.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		companyName: text('company_name').notNull(),
		locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
		/** Dates, not timestamps — nobody records the hour they started a job. */
		startedOn: date('started_on', { mode: 'date' }).notNull(),
		/** Null means current. */
		endedOn: date('ended_on', { mode: 'date' }),
		description: text('description')
	},
	(table) => [index('work_experiences_profile_idx').on(table.profileId, table.startedOn)]
);

export const educations = pgTable(
	'educations',
	{
		...baseColumns,
		profileId: uuid('profile_id')
			.notNull()
			.references(() => candidateProfiles.id, { onDelete: 'cascade' }),
		institution: text('institution').notNull(),
		qualification: text('qualification'),
		fieldOfStudy: text('field_of_study'),
		startedOn: date('started_on', { mode: 'date' }),
		endedOn: date('ended_on', { mode: 'date' })
	},
	(table) => [index('educations_profile_idx').on(table.profileId)]
);

export const candidateSkills = pgTable(
	'candidate_skills',
	{
		...baseColumns,
		profileId: uuid('profile_id')
			.notNull()
			.references(() => candidateProfiles.id, { onDelete: 'cascade' }),
		skillId: uuid('skill_id')
			.notNull()
			.references(() => skills.id, { onDelete: 'cascade' }),
		yearsOfExperience: integer('years_of_experience')
	},
	(table) => [
		uniqueIndex('candidate_skills_key').on(table.profileId, table.skillId),
		index('candidate_skills_skill_idx').on(table.skillId)
	]
);

export type CandidateProfile = typeof candidateProfiles.$inferSelect;
export type Document = typeof documents.$inferSelect;
