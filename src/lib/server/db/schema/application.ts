import {
	boolean,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { baseColumns, primaryKeyColumn } from './_shared';
import { candidateProfiles, documents } from './candidate';
import { users } from './identity';
import { jobs, jobScreeningQuestions } from './job';
import { organizations } from './org';

/**
 * Where an application stands, from the candidate's point of view.
 *
 * Deliberately coarse. The employer's pipeline has as many stages as they like
 * (Phase 4, `job_stages`); this is what the candidate is told, and inventing a
 * public vocabulary that mirrors internal stages would leak how a company works.
 */
export const applicationStatusEnum = pgEnum('application_status', [
	'submitted',
	'in_review',
	'interviewing',
	'offered',
	'hired',
	'rejected',
	'withdrawn'
]);

export const applications = pgTable(
	'applications',
	{
		...baseColumns,
		jobId: uuid('job_id')
			.notNull()
			.references(() => jobs.id, { onDelete: 'cascade' }),
		/** Denormalized so employer-side queries never join through `jobs`. */
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		profileId: uuid('profile_id').references(() => candidateProfiles.id, { onDelete: 'set null' }),

		status: applicationStatusEnum('status').notNull().default('submitted'),
		/**
		 * Which column of the board this sits in. A cache of the most recent
		 * `stage_transitions` row — the history is the fact, this is the fast answer.
		 *
		 * Nullable because an application filed before the job had stages, or one
		 * whose stage was deleted, still has to be somewhere: the board treats null
		 * as "in the first column".
		 *
		 * Declared without a `references()` on purpose. The foreign key exists — it is
		 * added by the migration alongside `job_stages` — but writing it here would
		 * make `application.ts` import `ats.ts` while `ats.ts` imports this file, and
		 * a cycle between two schema modules is a debugging session nobody needs.
		 */
		currentStageId: uuid('current_stage_id'),
		/** The resume as attached at apply time — the candidate may change theirs later. */
		resumeDocumentId: uuid('resume_document_id').references(() => documents.id, {
			onDelete: 'set null'
		}),
		coverLetter: text('cover_letter'),

		/** Where the candidate came from, for source-effectiveness reporting. */
		source: text('source').notNull().default('direct'),

		/**
		 * When someone from the org first responded. Null while the candidate is
		 * waiting — this single column is what makes the response-time and ghosting
		 * statistics in Phase 7 computable rather than self-reported.
		 */
		firstRespondedAt: timestamp('first_responded_at', { withTimezone: true, mode: 'date' }),
		rejectedAt: timestamp('rejected_at', { withTimezone: true, mode: 'date' }),
		rejectionReason: text('rejection_reason'),
		withdrawnAt: timestamp('withdrawn_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		// One application per person per job. Re-applying is a withdrawal and a new
		// application, not a silent duplicate row.
		uniqueIndex('applications_job_user_key').on(table.jobId, table.userId),
		index('applications_org_status_idx').on(table.organizationId, table.status),
		index('applications_job_idx').on(table.jobId, table.createdAt),
		index('applications_user_idx').on(table.userId, table.createdAt),
		// Powers the "waiting on a reply" query behind the ghosting statistics.
		index('applications_unanswered_idx').on(table.firstRespondedAt, table.createdAt)
	]
);

export const applicationAnswers = pgTable(
	'application_answers',
	{
		...baseColumns,
		applicationId: uuid('application_id')
			.notNull()
			.references(() => applications.id, { onDelete: 'cascade' }),
		questionId: uuid('question_id')
			.notNull()
			.references(() => jobScreeningQuestions.id, { onDelete: 'cascade' }),
		/** JSON-encoded, because the shape depends on the question type. */
		answer: text('answer').notNull()
	},
	(table) => [uniqueIndex('application_answers_key').on(table.applicationId, table.questionId)]
);

export const applicationEventTypeEnum = pgEnum('application_event_type', [
	'submitted',
	'viewed',
	'status_changed',
	'note_added',
	'email_sent',
	'interview_scheduled',
	'withdrawn'
]);

/**
 * Append-only history of everything that happened to an application.
 *
 * Never updated or deleted. It backs the candidate's status timeline — the
 * transparency this product is built on — and answers "who moved this and when"
 * on the employer side. A mutable log would be worth nothing for either.
 */
export const applicationEvents = pgTable(
	'application_events',
	{
		...primaryKeyColumn,
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		applicationId: uuid('application_id')
			.notNull()
			.references(() => applications.id, { onDelete: 'cascade' }),
		type: applicationEventTypeEnum('type').notNull(),
		/** Null for candidate-initiated or system events. */
		actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
		/** Whether the candidate sees this entry. Internal notes do not surface. */
		visibleToCandidate: boolean('visible_to_candidate').notNull().default(false),
		payload: jsonb('payload').$type<Record<string, unknown>>()
	},
	(table) => [index('application_events_application_idx').on(table.applicationId, table.createdAt)]
);

export type Application = typeof applications.$inferSelect;
export type ApplicationStatus = (typeof applicationStatusEnum.enumValues)[number];
