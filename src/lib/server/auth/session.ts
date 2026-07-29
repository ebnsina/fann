import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { db } from '../db';
import { sessions, users, type Session, type User } from '../db/schema/identity';
import { secureCookies } from '../runtime';

export const SESSION_COOKIE = 'fann_session';

const DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Renew once past the halfway mark, so an active user is never logged out mid-task. */
const RENEW_AFTER_MS = DURATION_MS / 2;

/** 32 bytes of CSPRNG entropy — not a JWT, so it can be revoked server-side. */
function generateToken(): string {
	return randomBytes(32).toString('base64url');
}

/**
 * Only the hash is stored. A read-only leak of `sessions` therefore yields nothing
 * that can be replayed as a cookie.
 */
function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export interface SessionContext {
	user: User;
	session: Session;
}

export async function createSession(
	userId: string,
	meta: { ipAddress?: string | null; userAgent?: string | null } = {}
): Promise<{ token: string; expiresAt: Date }> {
	const token = generateToken();
	const expiresAt = new Date(Date.now() + DURATION_MS);

	await db.insert(sessions).values({
		userId,
		tokenHash: hashToken(token),
		expiresAt,
		ipAddress: meta.ipAddress ?? null,
		userAgent: meta.userAgent ?? null
	});

	return { token, expiresAt };
}

/**
 * Resolve a cookie value to its user, renewing the session when it is past halfway.
 * Returns null for anything invalid or expired — callers must not distinguish the
 * two, since the difference is not useful to a legitimate user.
 */
export async function validateSession(token: string): Promise<SessionContext | null> {
	const tokenHash = hashToken(token);

	const [row] = await db
		.select({ user: users, session: sessions })
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.tokenHash, tokenHash))
		.limit(1);

	if (!row) return null;

	// The lookup was by unique hash, but compare again in constant time so a
	// hypothetical index-timing signal cannot be used to probe for valid tokens.
	const found = Buffer.from(row.session.tokenHash);
	const expected = Buffer.from(tokenHash);
	if (found.byteLength !== expected.byteLength || !timingSafeEqual(found, expected)) return null;

	if (row.session.expiresAt.getTime() <= Date.now()) {
		await invalidateSession(row.session.id);
		return null;
	}

	// A deactivated account must lose access immediately, not at token expiry.
	if (row.user.deactivatedAt) {
		await invalidateUserSessions(row.user.id);
		return null;
	}

	if (row.session.expiresAt.getTime() - Date.now() < RENEW_AFTER_MS) {
		const expiresAt = new Date(Date.now() + DURATION_MS);
		await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, row.session.id));
		row.session.expiresAt = expiresAt;
	}

	return row;
}

export async function invalidateSession(sessionId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Used on password change and deactivation — every device must be signed out. */
export async function invalidateUserSessions(userId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Housekeeping for a scheduled job; expired sessions are already rejected on read. */
export async function deleteExpiredSessions(): Promise<void> {
	await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		// `lax` still sends the cookie on top-level navigation, so following a link
		// from an email lands the user signed in, while blocking cross-site POSTs.
		sameSite: 'lax',
		secure: secureCookies,
		expires: expiresAt
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
