import { form, query } from '$app/server';
import { requireUser } from '#lib/server/auth/guards';
import * as profileService from '#lib/server/services/profile';
import { profileSchema } from '#lib/schemas/profile';

/**
 * The signed-in candidate's own profile.
 *
 * There is deliberately no "get a profile by id" beside it. The moment one
 * exists, something will call it without checking `visibility`, and the promise
 * on the privacy page stops being true.
 */
export const myProfile = query(async () => {
	const user = requireUser();
	return profileService.forUser(user.id);
});

export const saveProfile = form(profileSchema, async (input) => {
	const user = requireUser();

	await profileService.save(user.id, input);
	await myProfile().refresh();

	return { saved: true };
});
