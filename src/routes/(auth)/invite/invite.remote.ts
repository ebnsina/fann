import * as v from 'valibot';
import { command } from '$app/server';
import { requireUser } from '#lib/server/auth/guards';
import * as team from '#lib/server/services/team';

/**
 * Accepting an invitation.
 *
 * Signed in only — an invite proves somebody meant to add *this address* to a
 * team, not who is holding the link. The service then checks the address matches
 * the account, so a forwarded link cannot walk a stranger into someone else's
 * hiring data.
 */
export const acceptInvite = command(v.pipe(v.string(), v.nonEmpty()), async (token) => {
	const user = requireUser();
	return team.acceptInvite(token, user.id, user.email);
});
