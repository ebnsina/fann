import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { requirePermission } from '#lib/server/auth/guards';
import { db } from '#lib/server/db';
import { applications } from '#lib/server/db/schema/application';
import { interviews } from '#lib/server/db/schema/ats';
import { companies } from '#lib/server/db/schema/company';
import { jobs } from '#lib/server/db/schema/job';
import { listForApplication, toCalendar } from '#lib/server/services/interview';

/**
 * One interview as a calendar file.
 *
 * A route rather than a generated blob in the browser, so the same authorization
 * that guards the application guards its calendar entry — an `.ics` carries the
 * candidate's name and the company's plans, and a link that anyone could follow
 * would leak both.
 */
export const GET: RequestHandler = async ({ params }) => {
	const { organizationId } = await requirePermission(params.org, 'application.view');

	// The interview is found first so its application can be checked against the
	// caller's organization. Guessing an id must not reveal anything.
	const [row] = await db
		.select({
			applicationId: interviews.applicationId,
			companyName: companies.name
		})
		.from(interviews)
		.innerJoin(applications, eq(applications.id, interviews.applicationId))
		.innerJoin(jobs, eq(jobs.id, applications.jobId))
		.innerJoin(companies, eq(companies.id, jobs.companyId))
		.where(
			and(eq(interviews.id, params.interviewId), eq(applications.organizationId, organizationId))
		)
		.limit(1);

	if (!row) error(404, 'Not found.');

	const all = await listForApplication(row.applicationId, organizationId);
	const interview = all.find((candidate) => candidate.id === params.interviewId);
	if (!interview) error(404, 'Not found.');

	return new Response(toCalendar(interview, row.companyName), {
		headers: {
			'content-type': 'text/calendar; charset=utf-8',
			// `attachment` so the browser hands it to a calendar app rather than
			// rendering it as text.
			'content-disposition': `attachment; filename="interview-${interview.id}.ics"`,
			// Never cached by a shared proxy: it names a candidate.
			'cache-control': 'private, no-store'
		}
	});
};
