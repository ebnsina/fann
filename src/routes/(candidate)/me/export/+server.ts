import { error } from '@sveltejs/kit';
import { exportFor } from '#lib/server/services/account';
import type { RequestHandler } from './$types';

/**
 * Download everything held about the signed-in account.
 *
 * A route rather than a remote function because the useful shape of this is a
 * file the person keeps, not a value a page renders. `Content-Disposition:
 * attachment` is what makes the browser save it instead of displaying a wall of
 * JSON, and the filename is dated because somebody exercising this right is
 * usually building a record over time.
 */
export const GET: RequestHandler = async ({ locals }) => {
	// Not `requireUser`: this is an ordinary route, so the guard is explicit. A
	// missing session is 401 rather than a redirect — the caller is a download,
	// and an HTML sign-in page saved as .json helps nobody.
	if (!locals.user) error(401, 'Sign in to download your data.');

	const data = await exportFor(locals.user.id);
	const stamp = new Date().toISOString().slice(0, 10);

	return new Response(JSON.stringify(data, null, 2), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="fann-data-${stamp}.json"`,
			// It is a copy of somebody's personal data. Nothing should keep it.
			'cache-control': 'no-store'
		}
	});
};
