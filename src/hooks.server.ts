import type { Handle, HandleServerError } from '@sveltejs/kit';
import { THEME_COOKIE, parseTheme } from '#lib/theme.svelte';
import { isProduction } from '#lib/server/runtime';
import {
	SESSION_COOKIE,
	clearSessionCookie,
	setSessionCookie,
	validateSession
} from '#lib/server/auth/session';

/**
 * Resolves the session once per request and hangs it on `locals`.
 *
 * This is convenience, not protection: remote functions are reachable as raw HTTP
 * endpoints, so authorization lives in the guards they call, not here.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);

	if (token) {
		const context = await validateSession(token);

		if (context) {
			event.locals.user = context.user;
			event.locals.session = context.session;
			// `validateSession` slides the expiry; mirror it onto the cookie so the
			// browser keeps the token as long as the server considers it valid.
			setSessionCookie(event.cookies, token, context.session.expiresAt);
		} else {
			// The cookie is invalid or expired — drop it so the browser stops sending it.
			clearSessionCookie(event.cookies);
		}
	}

	// The theme, stamped onto `<html>` before the first byte leaves.
	//
	// This is why the preference is a cookie and not `localStorage`: a cookie
	// arrives with the request, so the markup we send is already correct instead of
	// being corrected by a script after it lands. `system` is left blank — nothing
	// in an HTTP request says what the operating system is set to, so the small
	// script in `app.html` resolves that one case before paint.
	const preference = parseTheme(event.cookies.get(THEME_COOKIE));
	const themeClass = preference === 'system' ? '' : preference;

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%fann.theme%', themeClass)
	});
};

/**
 * The last stop for anything that was not caught on the way up.
 *
 * Two jobs. First, log it with enough context to find it again — the route, the
 * method, and a reference that also goes to the person who hit it, so a support
 * message can be matched to a stack trace without asking them what they clicked.
 *
 * Second, decide what the browser is told. In production that is a fixed
 * sentence: an uncaught error message is written for whoever wrote the code, and
 * it routinely contains a query, a file path, or a column name. In development it
 * is passed through, because there the person reading it is the person debugging.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const reference = crypto.randomUUID();

	console.error(
		`[${reference}] ${status} ${event.request.method} ${event.url.pathname} — ${message}`,
		error
	);

	return {
		message: isProduction ? 'Something went wrong on our end.' : String(message),
		reference
	};
};
