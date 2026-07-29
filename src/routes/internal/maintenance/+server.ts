import { json } from '@sveltejs/kit';
import { assertScheduler } from '#lib/server/cron';
import { deleteExpiredSessions } from '#lib/server/auth/session';
import { expireOverdue } from '#lib/server/services/offer';
import type { RequestHandler } from './$types';

/**
 * Recurring housekeeping. Called on a schedule, not by a person.
 *
 * One endpoint for the cheap, frequent jobs rather than one route each: a
 * scheduler is easier to configure with a single URL, both are idempotent, and
 * neither depends on the other. The benchmark rebuild stays separate because it
 * runs nightly and does real work.
 *
 * Every job is attempted even if an earlier one fails. A failed session prune
 * must not be the reason an offer sits open past its deadline.
 */
export const POST: RequestHandler = async ({ request }) => {
	assertScheduler(request);

	const results = await Promise.allSettled([expireOverdue(), deleteExpiredSessions()]);

	const [offers, sessions] = results;

	if (offers.status === 'rejected') console.error('Expiring offers failed', offers.reason);
	if (sessions.status === 'rejected') console.error('Pruning sessions failed', sessions.reason);

	return json({
		ok: results.every((result) => result.status === 'fulfilled'),
		// How many offers lapsed. Worth returning rather than logging: a scheduler
		// that reports "0 for three weeks" is how you notice the job stopped working.
		offersExpired: offers.status === 'fulfilled' ? offers.value : null,
		sessionsPruned: sessions.status === 'fulfilled' ? true : null
	});
};
