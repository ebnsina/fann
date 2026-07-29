import * as v from 'valibot';
import { command, getRequestEvent, query } from '$app/server';
import { requirePermission } from '#lib/server/auth/guards';
import * as applicationService from '#lib/server/services/application';

/**
 * Employer-side application review.
 *
 * Every function guards on an explicit permission before touching candidate data.
 * `application.view` is granted to every role including `viewer`; advancing and
 * rejecting are not.
 */

export const listApplicants = query(
	v.object({ orgSlug: v.string(), jobId: v.pipe(v.string(), v.uuid()) }),
	async ({ orgSlug, jobId }) => {
		const { organizationId } = await requirePermission(orgSlug, 'application.view');
		return applicationService.listForJob(jobId, organizationId);
	}
);

/**
 * Everyone who has applied to any of this organization's jobs.
 *
 * The cross-job list behind `/hire/[org]/candidates`, as opposed to the per-job
 * board. Filters are server-side so the page never holds more than it shows.
 */
export const listOrgApplicants = query(
	v.object({
		orgSlug: v.string(),
		search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
		status: v.optional(
			v.picklist([
				'submitted',
				'in_review',
				'interviewing',
				'offered',
				'hired',
				'rejected',
				'withdrawn'
			])
		),
		waitingOnly: v.optional(v.boolean())
	}),
	async ({ orgSlug, search, status, waitingOnly }) => {
		const { organizationId } = await requirePermission(orgSlug, 'application.view');
		return applicationService.listForOrg(organizationId, { search, status, waitingOnly });
	}
);

export const advanceApplication = command(
	v.object({
		orgSlug: v.string(),
		applicationId: v.pipe(v.string(), v.uuid()),
		jobId: v.pipe(v.string(), v.uuid()),
		status: v.picklist(['in_review', 'interviewing', 'offered', 'hired'])
	}),
	async ({ orgSlug, applicationId, jobId, status }) => {
		const { organizationId, user } = await requirePermission(orgSlug, 'application.advance');
		const { url } = getRequestEvent();

		const application = await applicationService.changeStatus(
			applicationId,
			organizationId,
			user.id,
			status,
			undefined,
			url.origin
		);

		await listApplicants({ orgSlug, jobId }).refresh();
		return { status: application.status };
	}
);

export const rejectApplication = command(
	v.object({
		orgSlug: v.string(),
		applicationId: v.pipe(v.string(), v.uuid()),
		jobId: v.pipe(v.string(), v.uuid()),
		/**
		 * Required, and shown to the candidate. A rejection without a reason is the
		 * thing this product exists to stop being normal.
		 */
		reason: v.pipe(
			v.string(),
			v.trim(),
			v.nonEmpty('Give the candidate a reason.'),
			v.maxLength(500)
		)
	}),
	async ({ orgSlug, applicationId, jobId, reason }) => {
		const { organizationId, user } = await requirePermission(orgSlug, 'application.reject');
		const { url } = getRequestEvent();

		await applicationService.changeStatus(
			applicationId,
			organizationId,
			user.id,
			'rejected',
			reason,
			url.origin
		);

		await listApplicants({ orgSlug, jobId }).refresh();
		return { rejected: true };
	}
);

/** Records that someone opened the application. Not shown to the candidate. */
export const markViewed = command(
	v.object({ orgSlug: v.string(), applicationId: v.pipe(v.string(), v.uuid()) }),
	async ({ orgSlug, applicationId }) => {
		const { organizationId, user } = await requirePermission(orgSlug, 'application.view');
		await applicationService.recordView(applicationId, organizationId, user.id);
		return { recorded: true };
	}
);
