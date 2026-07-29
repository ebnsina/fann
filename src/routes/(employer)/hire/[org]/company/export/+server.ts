import { error } from '@sveltejs/kit';
import { requirePermission } from '#lib/server/auth/guards';
import { exportFor } from '#lib/server/services/organization-account';
import type { RequestHandler } from './$types';

/**
 * Download everything this company holds, as a file it can keep.
 *
 * A route rather than a remote function for the same reason the candidate export
 * is one: the useful shape is a file, and `Content-Disposition` is what makes the
 * browser save it instead of rendering a wall of JSON.
 *
 * Guarded on `org.delete` rather than `org.update`. The file contains every
 * candidate's name, email, cover letter and the team's private notes about them
 * in one place — that is a bigger thing to hand out than the right to edit a
 * tagline, and it should need the same authority as closing the account.
 */
export const GET: RequestHandler = async ({ params }) => {
	const { organizationId } = await requirePermission(params.org, 'org.delete');

	const data = await exportFor(organizationId);
	if (!data) error(404, 'Not found.');

	const stamp = new Date().toISOString().slice(0, 10);

	return new Response(JSON.stringify(data, null, 2), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="fann-${params.org}-${stamp}.json"`,
			// Other people's personal data. Nothing may keep a copy.
			'cache-control': 'no-store'
		}
	});
};
