import { redirect } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { signupSchema } from '#lib/schemas/auth';
import { joinCompanySchema } from '#lib/schemas/join';
import { setPendingCompanyName } from '#lib/server/auth/pending-company';
import { clientAddress, startSession } from '#lib/server/auth/request';
import { RULES, enforce } from '#lib/server/rate-limit';
import * as auth from '#lib/server/services/auth';

/**
 * Sign-up from the two join pages.
 *
 * These are separate endpoints from `/signup` rather than one form with a hidden
 * "intent" field, because a hidden field is a request parameter like any other —
 * anyone can flip it. Keeping them apart means the company path can ask for a
 * company name and validate it, and neither endpoint carries a branch.
 *
 * Remote functions are reachable as plain HTTP, so each one rate-limits and
 * validates for itself. There is no middleware upstream doing it for them.
 */

export const joinAsCandidate = form(signupSchema, async ({ name, email, _password }) => {
	await enforce(RULES.signup, [`ip:${clientAddress()}`, `email:${email}`]);

	const { url } = getRequestEvent();
	const user = await auth.signup({ name, email, password: _password }, url.origin);

	// Signing them straight in is safe — they hold the password either way — and
	// bouncing to a login screen loses people for no security gain.
	await startSession(user.id);
	redirect(303, '/verify/sent');
});

export const joinAsCompany = form(
	joinCompanySchema,
	async ({ name, email, _password, company }) => {
		await enforce(RULES.signup, [`ip:${clientAddress()}`, `email:${email}`]);

		const { url } = getRequestEvent();
		const user = await auth.signup({ name, email, password: _password }, url.origin);

		// The company itself is created after the address is confirmed — an entity that
		// posts public jobs should have a verified inbox behind it. This only saves the
		// person retyping the name once they get there.
		setPendingCompanyName(company);

		await startSession(user.id);
		redirect(303, '/verify/sent');
	}
);
