import * as v from 'valibot';
import { command, getRequestEvent, query } from '$app/server';
import { requireUser } from '#lib/server/auth/guards';
import { clearSessionCookie, invalidateUserSessions } from '#lib/server/auth/session';
import * as account from '#lib/server/services/account';

/**
 * Whether this account can be closed, and why not if it cannot.
 *
 * Asked before the button is drawn rather than after it is pressed. Somebody who
 * has to hand a company over first should learn that while deciding, not from an
 * error at the end of a confirmation dialog.
 */
export const deletionBlocker = query(async () => {
	const user = requireUser();
	return { blocker: await account.deletionBlocker(user.id) };
});

/**
 * Close the account.
 *
 * The session is destroyed here rather than left to expire: the row it points at
 * has just been anonymised, and a browser still holding a valid cookie for it is
 * a loose end nobody wants to reason about.
 *
 * Returns rather than redirects. A `redirect()` inside a `command` is refused at
 * runtime by kit@3 — "Redirects are not allowed in commands" — and because the
 * throw happens *after* the work, the account really is closed while the page
 * shows an error and stays put. The caller navigates.
 */
export const deleteAccount = command(v.optional(v.null()), async () => {
	const user = requireUser();
	const { cookies } = getRequestEvent();

	await account.deleteAccount(user.id);

	// `deleteAccount` already drops every session row; this clears the cookie the
	// browser is still holding, so the next request does not spend a round trip
	// presenting a token for an account that no longer answers to it.
	await invalidateUserSessions(user.id);
	clearSessionCookie(cookies);

	return { closed: true };
});
