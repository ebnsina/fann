import * as v from 'valibot';
import { eq } from 'drizzle-orm';
import { command, query } from '$app/server';
import { requirePermission } from '#lib/server/auth/guards';
import { db } from '#lib/server/db';
import { companies } from '#lib/server/db/schema/company';
import { RULES, enforce } from '#lib/server/rate-limit';
import { unavailableReason } from '#lib/server/ai';
import { draftJobDescription } from '#lib/server/ai/tasks/job-description';

/**
 * AI assists for the employer side.
 *
 * Guarded on `job.create`, the same permission as the form this helps with —
 * anybody who cannot post a job has no reason to be spending tokens.
 */

/** Why AI is off, or null. Asked before the button is drawn. */
export const aiStatus = query(async () => ({ unavailable: unavailableReason() }));

const draftSchema = v.object({
	orgSlug: v.string(),
	title: v.pipe(v.string(), v.trim(), v.nonEmpty('Give the role a title first.')),
	notes: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(4000)), ''),
	salaryMin: v.number(),
	salaryMax: v.number(),
	salaryCurrency: v.string(),
	salaryPeriod: v.string(),
	workMode: v.string(),
	employmentType: v.string(),
	experienceLevel: v.string()
});

export const draftDescription = command(draftSchema, async ({ orgSlug, ...input }) => {
	const { organizationId, user } = await requirePermission(orgSlug, 'job.create');

	// Tokens cost money and this is a button somebody will press repeatedly while
	// tweaking the notes.
	await enforce(RULES.aiDraft, [`org:${organizationId}`]);

	const [company] = await db
		.select({ name: companies.name })
		.from(companies)
		.where(eq(companies.organizationId, organizationId))
		.limit(1);

	const result = await draftJobDescription(
		{ ...input, companyName: company?.name ?? 'the company' },
		{ organizationId, userId: user.id }
	);

	// Returned rather than thrown. A draft failing must not take down a form
	// somebody has half filled in — they still have the editor they had before.
	return result;
});
