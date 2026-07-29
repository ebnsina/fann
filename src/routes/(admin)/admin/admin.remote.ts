import * as v from 'valibot';
import { command, getRequestEvent, query } from '$app/server';
import { requireUser } from '#lib/server/auth/guards';
import * as admin from '#lib/server/services/admin';

/**
 * The platform console.
 *
 * Guarded inside the service, never by the route group — remote functions are
 * reachable as raw HTTP, so being under `(admin)` protects nothing. Denials are
 * not-found, so probing does not confirm the console exists.
 */

export const platformOverview = query(async () => {
	const user = requireUser();
	return admin.overview(user.id);
});

/**
 * Whether the signed-in person is staff.
 *
 * The one function here that does not 404 for everybody else, because it has to
 * answer "no" to draw the page without an admin link. It leaks nothing: the
 * asker already knows their own account.
 */
export const isPlatformStaff = query(async () => {
	const { locals } = getRequestEvent();
	return Boolean(locals.user?.platformAdmin);
});

export const searchUsers = query(v.string(), async (term) => {
	const user = requireUser();
	return admin.findUsers(user.id, term);
});

export const adminOrganizations = query(v.optional(v.string(), ''), async (term) => {
	const user = requireUser();
	return admin.listOrganizations(user.id, { term });
});

export const adminJobs = query(v.optional(v.string(), ''), async (term) => {
	const user = requireUser();
	return admin.listJobs(user.id, { term });
});

export const adminFailedEmails = query(async () => {
	const user = requireUser();
	return admin.failedEmails(user.id);
});

/**
 * Take a listing off the board, or restore it as a draft.
 *
 * The only write on this console. Reversible and soft: the job row, its
 * applications and their timelines are untouched, so the action can be undone
 * and can be shown to have been wrong.
 */
export const setJobTakenDown = command(
	v.object({ jobId: v.pipe(v.string(), v.uuid()), takenDown: v.boolean(), term: v.string() }),
	async ({ jobId, takenDown, term }) => {
		const user = requireUser();

		await admin.setJobTakenDown(user.id, jobId, takenDown);
		await adminJobs(term).refresh();

		return { takenDown };
	}
);
