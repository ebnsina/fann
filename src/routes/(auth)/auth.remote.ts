import * as v from 'valibot';
import { error, invalid, redirect } from '@sveltejs/kit';
import { command, form, getRequestEvent, query } from '$app/server';
import {
	loginSchema,
	requestPasswordResetSchema,
	resetPasswordSchema,
	signupSchema
} from '#lib/schemas/auth';
import * as auth from '#lib/server/services/auth';
import { clearSessionCookie } from '#lib/server/auth/session';
import { clientAddress, startSession } from '#lib/server/auth/request';
import { RULES, enforce, reset as resetRateLimit } from '#lib/server/rate-limit';

/**
 * Auth endpoints.
 *
 * Remote functions are reachable as plain HTTP, so each one does its own rate
 * limiting and validation — there is no middleware upstream doing it for them.
 */

/** The signed-in user, for rendering nav and guarding client-side routes. */
export const currentUser = query(async () => {
	const { locals } = getRequestEvent();
	if (!locals.user) return null;

	// Never spread the row: it carries `passwordHash`, and a query result is
	// serialized straight to the browser.
	return {
		id: locals.user.id,
		name: locals.user.name,
		email: locals.user.email,
		emailVerified: Boolean(locals.user.emailVerifiedAt),
		// Draws the Platform link and nothing else. Every function behind it checks
		// again in the service, because a hidden link protects nothing on its own.
		platformAdmin: locals.user.platformAdmin
	};
});

export const signup = form(signupSchema, async ({ name, email, _password }) => {
	await enforce(RULES.signup, [`ip:${clientAddress()}`, `email:${email}`]);

	const { url } = getRequestEvent();
	const user = await auth.signup({ name, email, password: _password }, url.origin);

	// Signing the user straight in is safe: they hold the password either way, and
	// the alternative — bouncing to a login screen — loses people for no security gain.
	await startSession(user.id);
	redirect(303, '/verify/sent');
});

export const login = form(loginSchema, async ({ email, _password }) => {
	// Limit by address and by account, so neither a botnet nor a targeted lockout works.
	await enforce(RULES.login, [`ip:${clientAddress()}`, `email:${email}`]);

	const user = await auth.authenticate(email, _password);
	if (!user) {
		// `invalid`, not `error`: a wrong password is a problem with what was typed,
		// not a broken request. `error(401)` unmounted the whole page and replaced it
		// with the error screen, losing the form and the email they had entered.
		// This comes back as a form-level issue and renders above the fields.
		//
		// One message for both failures. Naming which half was wrong is a free
		// account-existence check for anyone who asks.
		invalid('That email or password is not right.');
	}

	await resetRateLimit(RULES.login, `email:${email}`);
	await startSession(user.id);
	redirect(303, '/');
});

export const logout = command(async () => {
	const { cookies, locals } = getRequestEvent();

	if (locals.session) {
		const { invalidateSession } = await import('#lib/server/auth/session');
		await invalidateSession(locals.session.id);
	}

	clearSessionCookie(cookies);
	redirect(303, '/');
});

export const requestPasswordReset = form(requestPasswordResetSchema, async ({ email }) => {
	await enforce(RULES.passwordReset, [`ip:${clientAddress()}`, `email:${email}`]);

	const { url } = getRequestEvent();
	await auth.requestPasswordReset(email, url.origin);

	// Deliberately identical whether or not the account exists.
	return { sent: true };
});

export const resetPassword = form(resetPasswordSchema, async ({ token, _password }) => {
	const ok = await auth.resetPassword(token, _password);
	if (!ok) error(400, 'That reset link has expired or has already been used.');

	redirect(303, '/login?reset=1');
});

export const verifyEmail = command(v.string(), async (token) => {
	const ok = await auth.verifyEmail(token);
	if (!ok) error(400, 'That confirmation link has expired or has already been used.');

	await currentUser().refresh();
	return { verified: true };
});

export const resendVerification = command(async () => {
	const { locals, url } = getRequestEvent();
	if (!locals.user) error(401, 'You need to be signed in.');
	if (locals.user.emailVerifiedAt) return { sent: false };

	await enforce(RULES.emailVerification, [`user:${locals.user.id}`]);
	await auth.sendVerificationEmail(locals.user, url.origin);

	return { sent: true };
});
