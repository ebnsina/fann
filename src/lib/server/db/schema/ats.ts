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
import { baseColumns, primaryKeyColumn, timestampColumns } from './_shared';
import { applications } from './application';
import { users } from './identity';
import { jobs } from './job';
import { organizations } from './org';

/**
 * Hiring stages — the columns of the board an employer moves people through.
 *
 * Two levels, and the split matters. A **template** belongs to the organization
 * and describes how that company hires; **job stages** are the copy taken when a
 * job is created. Jobs own their stages outright rather than pointing at the
 * template, because a template that could be edited underneath a job in flight
 * would silently move candidates between columns that no longer mean what they
 * meant when someone was put there.
 */

/**
 * What a stage *is*, as opposed to what it is called.
 *
 * A company may name a column "Coffee chat" or "Take-home", and should. But the
 * product needs to know which column means "they have not been looked at yet" and
 * which means "we said no", because the response clock, the candidate's timeline
 * and the ghosting statistics all depend on it. The kind is that answer; the name
 * is decoration on top of it.
 */
export const stageKindEnum = pgEnum('stage_kind', [
	'applied',
	'screening',
	'interview',
	'offer',
	'hired',
	'rejected'
]);

export const pipelineTemplates = pgTable(
	'pipeline_templates',
	{
		...baseColumns,
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		/** Used for new jobs when none is chosen. Exactly one per org — see the index. */
		isDefault: boolean('is_default').notNull().default(false)
	},
	(table) => [
		index('pipeline_templates_org_idx').on(table.organizationId),
		// A partial unique index: many templates per org, but only one flagged
		// default. Enforced here rather than in the service, because "two defaults"
		// is the kind of state that is easy to create in a race and impossible to
		// reason about afterwards.
		uniqueIndex('pipeline_templates_one_default_per_org')
			.on(table.organizationId)
			.where(sql`${table.isDefault}`)
	]
);

export const pipelineTemplateStages = pgTable(
	'pipeline_template_stages',
	{
		...baseColumns,
		templateId: uuid('template_id')
			.notNull()
			.references(() => pipelineTemplates.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		kind: stageKindEnum('kind').notNull().default('interview'),
		position: integer('position').notNull()
	},
	(table) => [uniqueIndex('pipeline_template_stages_order').on(table.templateId, table.position)]
);

export const jobStages = pgTable(
	'job_stages',
	{
		...baseColumns,
		jobId: uuid('job_id')
			.notNull()
			.references(() => jobs.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		kind: stageKindEnum('kind').notNull().default('interview'),
		/**
		 * Order on the board. Gaps are fine and expected — reordering rewrites the
		 * positions of the stages that moved, not the whole row set.
		 */
		position: integer('position').notNull()
	},
	(table) => [
		index('job_stages_job_idx').on(table.jobId, table.position),
		// Two stages on one job cannot share a slot, or the board's column order
		// depends on whatever the database returns first.
		uniqueIndex('job_stages_order').on(table.jobId, table.position)
	]
);

/**
 * Every move between stages, appended and never updated.
 *
 * This is what makes "how long does this company leave people in screening"
 * answerable. The current stage on the application is a cache of the last row
 * here; the history is the fact.
 */
export const stageTransitions = pgTable(
	'stage_transitions',
	{
		...primaryKeyColumn,
		...timestampColumns,
		applicationId: uuid('application_id')
			.notNull()
			.references(() => applications.id, { onDelete: 'cascade' }),
		/** Null on the first move — the application had no stage before it was filed. */
		fromStageId: uuid('from_stage_id').references(() => jobStages.id, { onDelete: 'set null' }),
		toStageId: uuid('to_stage_id').references(() => jobStages.id, { onDelete: 'set null' }),
		actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
		note: text('note')
	},
	(table) => [
		index('stage_transitions_application_idx').on(table.applicationId, table.createdAt),
		// Powers time-in-stage reporting without scanning the whole table.
		index('stage_transitions_stage_idx').on(table.toStageId, table.createdAt)
	]
);

/**
 * Internal notes on an application.
 *
 * Never shown to the candidate, and deliberately so — this is where a team argues
 * with itself about a decision, and a note written under the assumption of privacy
 * that later becomes public is how people learn to stop writing anything useful.
 * What the candidate sees is the `application_events` timeline, which is a
 * separate, deliberate act of communication.
 *
 * They are soft-deleted rather than removed: a note that shaped a hiring decision
 * is part of how that decision can be explained later, including to a regulator.
 */
export const applicationNotes = pgTable(
	'application_notes',
	{
		...baseColumns,
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
		applicationId: uuid('application_id')
			.notNull()
			.references(() => applications.id, { onDelete: 'cascade' }),
		/** Null once the author's account is gone; the note itself stays. */
		authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
		body: text('body').notNull()
	},
	(table) => [index('application_notes_application_idx').on(table.applicationId, table.createdAt)]
);

/**
 * Interview scorecards.
 *
 * The design rule that matters is the visibility one: **you cannot read anybody
 * else's scorecard until you have submitted your own.** A panel that can see the
 * first opinion before forming the second is not four assessments, it is one
 * assessment and three agreements — the effect is well documented and it is the
 * single cheapest thing an interview process can do to itself.
 *
 * That is why a scorecard is a draft until `submittedAt`, and why submitting is
 * one-way. Editing a score after reading the room is the same failure arriving a
 * few minutes later.
 */
export const scorecardCriteria = pgTable(
	'scorecard_criteria',
	{
		...baseColumns,
		jobId: uuid('job_id')
			.notNull()
			.references(() => jobs.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		/** What a strong answer looks like — the thing that makes scores comparable. */
		description: text('description'),
		position: integer('position').notNull()
	},
	(table) => [uniqueIndex('scorecard_criteria_order').on(table.jobId, table.position)]
);

export const scorecards = pgTable(
	'scorecards',
	{
		...baseColumns,
		applicationId: uuid('application_id')
			.notNull()
			.references(() => applications.id, { onDelete: 'cascade' }),
		interviewerUserId: uuid('interviewer_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/**
		 * 1–4, with no midpoint. An odd scale lets a panel park on "3" and never
		 * decide; four forces a lean either way.
		 */
		overall: integer('overall'),
		summary: text('summary'),
		/** Null while it is a draft. Set once, and never cleared. */
		submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		// One scorecard per interviewer per application. A second row would be a way
		// to revise a submitted opinion, which is the thing being prevented.
		uniqueIndex('scorecards_application_interviewer_key').on(
			table.applicationId,
			table.interviewerUserId
		),
		index('scorecards_application_idx').on(table.applicationId)
	]
);

export const scorecardRatings = pgTable(
	'scorecard_ratings',
	{
		...baseColumns,
		scorecardId: uuid('scorecard_id')
			.notNull()
			.references(() => scorecards.id, { onDelete: 'cascade' }),
		criterionId: uuid('criterion_id')
			.notNull()
			.references(() => scorecardCriteria.id, { onDelete: 'cascade' }),
		rating: integer('rating').notNull(),
		comment: text('comment')
	},
	(table) => [uniqueIndex('scorecard_ratings_key').on(table.scorecardId, table.criterionId)]
);

/* ---------------------------------------------------------------------------
   Tags
   --------------------------------------------------------------------------- */

/**
 * Free-form labels an organization puts on applications.
 *
 * Org-level rather than per-job, because the point of a tag is that it means the
 * same thing across every role — "referred", "reapply in a year", "needs a visa".
 * A tag scoped to one job is a stage with extra steps.
 */
export const tags = pgTable(
	'tags',
	{
		...baseColumns,
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		name: text('name').notNull()
	},
	(table) => [
		// Case-sensitive on purpose: normalising is done in the service, so the index
		// enforces exactly what the service produced.
		uniqueIndex('tags_org_name_key').on(table.organizationId, table.name)
	]
);

export const applicationTags = pgTable(
	'application_tags',
	{
		...baseColumns,
		applicationId: uuid('application_id')
			.notNull()
			.references(() => applications.id, { onDelete: 'cascade' }),
		tagId: uuid('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' })
	},
	(table) => [
		uniqueIndex('application_tags_key').on(table.applicationId, table.tagId),
		index('application_tags_tag_idx').on(table.tagId)
	]
);

/* ---------------------------------------------------------------------------
   Interviews
   --------------------------------------------------------------------------- */

export const interviewModeEnum = pgEnum('interview_mode', ['video', 'phone', 'onsite']);

/**
 * A scheduled conversation with a candidate.
 *
 * Times are stored as an instant, never as a wall clock with a separate zone: an
 * interview at "2pm" means nothing to a candidate three time zones away, and the
 * calendar file this generates has to agree with what both sides see.
 */
export const interviews = pgTable(
	'interviews',
	{
		...baseColumns,
		applicationId: uuid('application_id')
			.notNull()
			.references(() => applications.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		mode: interviewModeEnum('mode').notNull().default('video'),
		/** A link for video, an address for onsite, a number for phone. */
		location: text('location'),
		startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
		durationMinutes: integer('duration_minutes').notNull().default(45),
		/** Shared with the candidate in the invitation. Not a place for opinions. */
		notes: text('notes'),
		createdByUserId: uuid('created_by_user_id').references(() => users.id, {
			onDelete: 'set null'
		}),
		/** Cancelled rather than deleted, so the candidate's timeline still explains itself. */
		cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [index('interviews_application_idx').on(table.applicationId, table.startsAt)]
);

export const interviewParticipants = pgTable(
	'interview_participants',
	{
		...baseColumns,
		interviewId: uuid('interview_id')
			.notNull()
			.references(() => interviews.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' })
	},
	(table) => [uniqueIndex('interview_participants_key').on(table.interviewId, table.userId)]
);

/* ---------------------------------------------------------------------------
   Offers
   --------------------------------------------------------------------------- */

export const offerStatusEnum = pgEnum('offer_status', [
	'draft',
	'sent',
	'accepted',
	'declined',
	'withdrawn',
	'expired'
]);

/**
 * An offer of employment.
 *
 * The pay fields are not nullable for the same reason a job listing's are not:
 * this product's whole argument is that the number is stated up front, and an
 * offer with a blank salary is the exact failure it exists to prevent — arriving
 * at the last step still not knowing.
 */
export const offers = pgTable(
	'offers',
	{
		...baseColumns,
		applicationId: uuid('application_id')
			.notNull()
			.references(() => applications.id, { onDelete: 'cascade' }),
		salaryAmount: integer('salary_amount').notNull(),
		salaryCurrency: varchar('salary_currency', { length: 3 }).notNull().default('USD'),
		salaryPeriod: text('salary_period').notNull().default('year'),
		/** Free text: equity, bonus, signing. Shown to the candidate as written. */
		extras: text('extras'),
		startDate: timestamp('start_date', { withTimezone: true, mode: 'date' }),
		/** After this, the offer lapses. A deadline nobody stated is not a deadline. */
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
		status: offerStatusEnum('status').notNull().default('draft'),
		sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
		decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
		createdByUserId: uuid('created_by_user_id').references(() => users.id, {
			onDelete: 'set null'
		})
	},
	(table) => [index('offers_application_idx').on(table.applicationId, table.createdAt)]
);

export type StageKind = (typeof stageKindEnum.enumValues)[number];
export type ApplicationNote = typeof applicationNotes.$inferSelect;
export type Scorecard = typeof scorecards.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Interview = typeof interviews.$inferSelect;
export type InterviewMode = (typeof interviewModeEnum.enumValues)[number];
export type Offer = typeof offers.$inferSelect;
export type OfferStatus = (typeof offerStatusEnum.enumValues)[number];
export type ScorecardCriterion = typeof scorecardCriteria.$inferSelect;
export type JobStage = typeof jobStages.$inferSelect;
export type PipelineTemplate = typeof pipelineTemplates.$inferSelect;
