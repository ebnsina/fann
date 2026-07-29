import { unsubscribeWithToken } from '#lib/server/services/notification';
import type { PageServerLoad } from './$types';

/**
 * One-click unsubscribe.
 *
 * A `+page.server.ts` load rather than a remote function, and deliberately: this
 * link is followed from an email by somebody who is probably not signed in, may
 * be in a different browser, and may have JavaScript off. It has to work as a
 * plain GET on a cold page or it does not work at all.
 *
 * Acting on GET is normally the wrong shape, and it is right here for the same
 * reason: an unsubscribe link that needs a confirmation button is one that mail
 * clients' own "unsubscribe" affordance cannot use, and one that a frustrated
 * person hits and assumes is broken. It is safe to repeat, it only ever switches
 * a category **off**, and the token is an HMAC so it cannot be aimed at anybody
 * whose id somebody guessed.
 */
export const load: PageServerLoad = async ({ params }) => {
	const result = await unsubscribeWithToken(params.token);

	// A bad token is reported plainly rather than as an error page. The usual cause
	// is a mail client that wrapped or truncated the link, and "that link did not
	// work, here is where the settings are" is more use than a 404.
	return { result };
};
