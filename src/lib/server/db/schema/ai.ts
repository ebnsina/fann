import { boolean, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { baseColumns } from './_shared';
import { organizations } from './org';
import { users } from './identity';

/**
 * Every call made to a language model.
 *
 * Written whether the call succeeded or not, and written before anything the
 * model produced is shown to anybody. Three reasons it exists from the first
 * feature rather than being retrofitted:
 *
 *   - **Cost is invisible otherwise.** Tokens are the bill, and a feature nobody
 *     is counting is one that surprises somebody at the end of a month.
 *   - **"What did it actually say" is the first question** when a model produces
 *     something wrong on a page with a company's name on it.
 *   - **Anything advisory that touches hiring has to be auditable.** This product
 *     does not let a model reject anybody, but the moment scoring exists the
 *     record of what ran, on what, and when is the difference between a claim and
 *     evidence.
 */
export const aiRuns = pgTable(
	'ai_runs',
	{
		...baseColumns,
		/** Which feature asked — `job_description`, and whatever comes next. */
		task: text('task').notNull(),
		provider: text('provider').notNull(),
		model: text('model').notNull(),

		/** Who it was for. Null for anything not tied to a company. */
		organizationId: uuid('organization_id').references(() => organizations.id, {
			onDelete: 'set null'
		}),
		userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

		ok: boolean('ok').notNull(),
		/** The provider's message when it failed, for working out what broke. */
		error: text('error'),

		inputTokens: integer('input_tokens'),
		outputTokens: integer('output_tokens'),
		latencyMs: integer('latency_ms')
	},
	(table) => [
		index('ai_runs_task_idx').on(table.task, table.createdAt),
		index('ai_runs_org_idx').on(table.organizationId, table.createdAt)
	]
);

export type AiRun = typeof aiRuns.$inferSelect;
