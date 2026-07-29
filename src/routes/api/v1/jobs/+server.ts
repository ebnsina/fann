import * as v from 'valibot';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '#lib/server/db';
import { jobs } from '#lib/server/db/schema/job';
import { jobDraftSchema } from '#lib/schemas/job';
import * as jobService from '#lib/server/services/job';
import { apiInvalid, apiJson, limitFrom, readJson, requireApiKey } from '../auth';

/** The form's own schema, plus the one thing a form does not need to say. */
const createJobSchema = v.object({
	...jobDraftSchema.entries,
	/** Draft unless asked otherwise — the safe default while an integration is new. */
	publish: v.optional(v.boolean(), false)
});
import type { RequestHandler } from './$types';

/**
 * This organization's jobs.
 *
 * Read-only, and scoped to the key's own organization in the `where` clause
 * rather than by anything the caller sends. There is no `?organizationId=`, so
 * there is nothing to tamper with.
 */
export const GET: RequestHandler = async ({ request, url }) => {
	const { organizationId } = await requireApiKey(request);

	const rows = await db
		.select({
			id: jobs.id,
			title: jobs.title,
			slug: jobs.slug,
			status: jobs.status,
			workMode: jobs.workMode,
			employmentType: jobs.employmentType,
			experienceLevel: jobs.experienceLevel,
			salaryMin: jobs.salaryMin,
			salaryMax: jobs.salaryMax,
			salaryCurrency: jobs.salaryCurrency,
			salaryPeriod: jobs.salaryPeriod,
			applicantCount: jobs.applicantCount,
			publishedAt: jobs.publishedAt,
			closesAt: jobs.closesAt,
			createdAt: jobs.createdAt
		})
		.from(jobs)
		.where(and(eq(jobs.organizationId, organizationId), isNull(jobs.deletedAt)))
		.orderBy(desc(jobs.createdAt))
		.limit(limitFrom(url));

	return apiJson({ data: rows });
};

/**
 * Post a job from somewhere else.
 *
 * The reason this endpoint exists: a company that already keeps its openings on
 * its own careers page, or in an ATS it is migrating from, should not have to
 * retype them here. It writes through the same service the form does, so
 * everything the form enforces is enforced — most importantly the salary range,
 * which `publishBlockers` refuses to publish without. There is no API path that
 * puts a job on this board without a number on it.
 *
 * `publish: false` leaves it as a draft, which is the safe default for an
 * integration somebody is still testing.
 */
export const POST: RequestHandler = async ({ request }) => {
	const { organizationId, createdByUserId } = await requireApiKey(request);

	if (!createdByUserId) {
		error(403, 'The account that created this key has been closed. Issue a new key.');
	}

	const parsed = v.safeParse(createJobSchema, await readJson(request));
	// The field paths are returned, because the caller here is a program and a
	// prose sentence gives it nothing to act on.
	if (!parsed.success) return apiInvalid(v.flatten(parsed.issues).nested ?? {});

	const { publish, ...draft } = parsed.output;

	let job = await jobService.createDraft(organizationId, createdByUserId, draft);
	if (publish) job = await jobService.changeStatus(job.id, organizationId, 'published');

	return apiJson({ data: { id: job.id, slug: job.slug, status: job.status } }, { status: 201 });
};
