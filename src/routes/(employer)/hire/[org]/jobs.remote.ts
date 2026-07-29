import * as v from 'valibot';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { error, redirect } from '@sveltejs/kit';
import { command, form, query } from '$app/server';
import { jobDraftSchema } from '#lib/schemas/job';
import { requireOrgMember, requirePermission } from '#lib/server/auth/guards';
import { db } from '#lib/server/db';
import { jobs } from '#lib/server/db/schema/job';
import * as jobService from '#lib/server/services/job';

/**
 * Employer-side job management.
 *
 * Every function opens with a guard. Remote functions are plain HTTP endpoints, so
 * being nested under `/hire/[org]` proves nothing about who is calling.
 */

/** Jobs belonging to an organization, for the management table. */
export const listJobs = query(v.string(), async (orgSlug) => {
	const { organizationId } = await requirePermission(orgSlug, 'job.view');

	return db
		.select({
			id: jobs.id,
			slug: jobs.slug,
			title: jobs.title,
			status: jobs.status,
			workMode: jobs.workMode,
			employmentType: jobs.employmentType,
			salaryMin: jobs.salaryMin,
			salaryMax: jobs.salaryMax,
			salaryCurrency: jobs.salaryCurrency,
			salaryPeriod: jobs.salaryPeriod,
			publishedAt: jobs.publishedAt,
			applicantCount: jobs.applicantCount,
			viewCount: jobs.viewCount,
			updatedAt: jobs.updatedAt
		})
		.from(jobs)
		.where(and(eq(jobs.organizationId, organizationId), isNull(jobs.deletedAt)))
		.orderBy(desc(jobs.updatedAt));
});

/** A single job for the editor, plus what currently stops it being published. */
export const getJob = query(
	v.object({ orgSlug: v.string(), jobId: v.string() }),
	async ({ orgSlug, jobId }) => {
		const { organizationId } = await requirePermission(orgSlug, 'job.view');

		const job = await jobService.findById(jobId, organizationId);
		if (!job) error(404, 'Not found.');

		return { ...job, blockers: jobService.publishBlockers(job) };
	}
);

const withOrg = v.object({ orgSlug: v.string(), draft: jobDraftSchema });

export const createJob = form(withOrg, async ({ orgSlug, draft }) => {
	const { organizationId, user } = await requirePermission(orgSlug, 'job.create');

	const job = await jobService.createDraft(organizationId, user.id, {
		...draft,
		equityRange: draft.equityRange || null,
		responseSlaDays: draft.responseSlaDays ?? null
	});

	await listJobs(orgSlug).refresh();
	redirect(303, `/hire/${orgSlug}/jobs/${job.id}`);
});

export const updateJob = form(
	v.object({ orgSlug: v.string(), jobId: v.string(), draft: jobDraftSchema }),
	async ({ orgSlug, jobId, draft }) => {
		const { organizationId } = await requirePermission(orgSlug, 'job.update');

		await jobService.updateDraft(jobId, organizationId, {
			...draft,
			equityRange: draft.equityRange || null,
			responseSlaDays: draft.responseSlaDays ?? null
		});

		await Promise.all([listJobs(orgSlug).refresh(), getJob({ orgSlug, jobId }).refresh()]);
		return { saved: true };
	}
);

export const changeJobStatus = command(
	v.object({
		orgSlug: v.string(),
		jobId: v.string(),
		status: v.picklist(['draft', 'pending_review', 'published', 'paused', 'closed', 'archived'])
	}),
	async ({ orgSlug, jobId, status }) => {
		// Publishing is a separate permission from editing: a hiring manager can draft
		// a role, but making it public is a recruiter's call.
		const permission = status === 'published' ? 'job.publish' : 'job.update';
		const { organizationId } = await requirePermission(orgSlug, permission);

		const job = await jobService.changeStatus(jobId, organizationId, status);

		await Promise.all([listJobs(orgSlug).refresh(), getJob({ orgSlug, jobId }).refresh()]);
		return { status: job.status };
	}
);

export const archiveJob = command(
	v.object({ orgSlug: v.string(), jobId: v.string() }),
	async ({ orgSlug, jobId }) => {
		const { organizationId } = await requirePermission(orgSlug, 'job.delete');

		await jobService.archive(jobId, organizationId);
		await listJobs(orgSlug).refresh();

		redirect(303, `/hire/${orgSlug}/jobs`);
	}
);

/** Organization header details for the shell. */
export const getOrganization = query(v.string(), async (orgSlug) => {
	const { organizationId, organizationSlug, role } = await requireOrgMember(orgSlug);
	return { id: organizationId, slug: organizationSlug, role };
});
