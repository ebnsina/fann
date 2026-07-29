import { json } from '@sveltejs/kit';
import { assertScheduler } from '#lib/server/cron';
import { refreshBenchmarks } from '#lib/server/services/salary';
import type { RequestHandler } from './$types';

/**
 * Rebuild the published pay figures. Called on a schedule, not by a person.
 *
 * An endpoint rather than a script because the service reaches the database
 * through the app's own configuration — and because a nightly rebuild is a
 * scheduled HTTP call in every deployment target this runs on. A second copy of
 * the aggregation SQL living in a script is how the figures on the site and the
 * figures in the table stop matching.
 */
export const POST: RequestHandler = async ({ request }) => {
	assertScheduler(request);

	const written = await refreshBenchmarks();
	return json({ ok: true, ...written });
};
