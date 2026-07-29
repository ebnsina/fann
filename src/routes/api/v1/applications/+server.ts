import { and, desc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { applications } from '#lib/server/db/schema/application';
import { jobs } from '#lib/server/db/schema/job';
import { users } from '#lib/server/db/schema/identity';
import { apiJson, limitFrom, requireApiKey } from '../auth';
import type { RequestHandler } from './$types';

/**
 * Applications this organization received.
 *
 * The candidate's name and email are here because the employer already holds
 * them — this is the same record their own board shows. What is **not** here is
 * the CV: a document is served only by `/files/[documentId]`, which re-checks
 * authorization and the virus scan on every request, and handing out a copy
 * through a second door would bypass both.
 *
 * Internal notes and scorecards are also absent. They are in the employer's own
 * export, which a person has to be an owner to download; an API key is a system,
 * and a system pulling colleagues' private opinions about candidates into
 * somebody's spreadsheet is not something this endpoint should make easy.
 */
export const GET: RequestHandler = async ({ request, url }) => {
	const { organizationId } = await requireApiKey(request);

	const status = url.searchParams.get('status');

	const rows = await db
		.select({
			id: applications.id,
			jobId: applications.jobId,
			jobTitle: jobs.title,
			candidateName: users.name,
			candidateEmail: users.email,
			status: applications.status,
			source: applications.source,
			appliedAt: applications.createdAt,
			firstRespondedAt: applications.firstRespondedAt,
			rejectedAt: applications.rejectedAt,
			rejectionReason: applications.rejectionReason
		})
		.from(applications)
		.innerJoin(jobs, eq(jobs.id, applications.jobId))
		.innerJoin(users, eq(users.id, applications.userId))
		.where(
			status
				? and(
						eq(applications.organizationId, organizationId),
						eq(applications.status, status as 'submitted')
					)
				: eq(applications.organizationId, organizationId)
		)
		.orderBy(desc(applications.createdAt))
		.limit(limitFrom(url));

	return apiJson({ data: rows });
};
