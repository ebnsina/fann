import * as v from 'valibot';
import { command, getRequestEvent, query } from '$app/server';
import { requireUser } from '#lib/server/auth/guards';
import * as savedJobs from '#lib/server/services/saved-job';

const jobId = v.pipe(v.string(), v.uuid());

/** Jobs the signed-in candidate has kept for later. */
export const mySavedJobs = query(async () => {
	const user = requireUser();
	return savedJobs.listForUser(user.id);
});

/**
 * Whether one job is saved — drives the bookmark button on a listing.
 *
 * Returns `false` rather than refusing when nobody is signed in: a job page is
 * public, and the button reading "not saved" for a signed-out visitor is correct.
 */
export const isSaved = query(jobId, async (id) => {
	const { locals } = getRequestEvent();
	if (!locals.user) return false;

	return (await savedJobs.savedAmong([id], locals.user.id)).has(id);
});

export const toggleSaved = command(jobId, async (id) => {
	const user = requireUser();

	const alreadySaved = (await savedJobs.savedAmong([id], user.id)).has(id);
	if (alreadySaved) {
		await savedJobs.remove(id, user.id);
	} else {
		await savedJobs.save(id, user.id);
	}

	await Promise.all([isSaved(id).refresh(), mySavedJobs().refresh()]);
	return { saved: !alreadySaved };
});
