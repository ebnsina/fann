import * as v from 'valibot';
import { query } from '$app/server';
import { requirePermission } from '#lib/server/auth/guards';
import * as analytics from '#lib/server/services/analytics';

/**
 * Hiring reports.
 *
 * Guarded on `application.view` rather than a reporting permission of its own:
 * these are aggregates over candidate data, so anybody who may not read the
 * applications must not read counts of them either. `viewer` has that permission,
 * which is right — seeing how long the team takes to reply is not privileged
 * information inside a company.
 *
 * The organization id comes from the guard, never from the request. A caller
 * naming its own scope is how one company reads another's hiring.
 */
const scopeSchema = v.object({
	orgSlug: v.string(),
	/** Empty string means every job, which is how a `<select>` sends "all". */
	jobId: v.optional(v.union([v.literal(''), v.pipe(v.string(), v.uuid())]), ''),
	/** Zero means all time. */
	windowDays: v.optional(v.number(), 0)
});

export const hiringReport = query(scopeSchema, async ({ orgSlug, jobId, windowDays }) => {
	const { organizationId } = await requirePermission(orgSlug, 'application.view');

	const scope = {
		organizationId,
		jobId: jobId || null,
		windowDays: windowDays || null
	};

	const [headline, funnel, stages, sources] = await Promise.all([
		analytics.headline(scope),
		analytics.funnel(scope),
		analytics.timeInStage(scope),
		analytics.bySource(scope)
	]);

	return { headline, funnel, stages, sources, minSample: analytics.MIN_SAMPLE };
});
