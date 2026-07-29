import { getRequestEvent } from '$app/server';
import { createSession, setSessionCookie } from './session';

/**
 * The two things every sign-up and sign-in endpoint needs.
 *
 * They live here rather than in one `.remote.ts` file because the auth routes and
 * the join pages both create accounts, and two copies of "how we start a session"
 * is exactly the kind of thing that drifts apart and leaves one of them not
 * recording an IP address.
 */

/** Best-effort caller address, used to rate-limit by origin as well as by account. */
export function clientAddress(): string {
	const event = getRequestEvent();
	try {
		return event.getClientAddress();
	} catch {
		// Not available in every adapter or runtime. The per-account limit still applies.
		return 'unknown';
	}
}

/** Issues a session cookie for a user who has just proved who they are. */
export async function startSession(userId: string): Promise<void> {
	const event = getRequestEvent();
	const { token, expiresAt } = await createSession(userId, {
		ipAddress: clientAddress(),
		userAgent: event.request.headers.get('user-agent')
	});
	setSessionCookie(event.cookies, token, expiresAt);
}
