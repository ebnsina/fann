import { getRequestEvent } from '$app/server';
import { secureCookies } from '../runtime';

/**
 * Carries the company name typed on the join page across email confirmation, so
 * the setup screen can pre-fill it instead of asking for it twice.
 *
 * It is a convenience only. Nothing is created from this value and nothing trusts
 * it — the worst a tampered cookie can do is put the wrong text in a field its
 * own owner is about to read and correct.
 *
 * These live in a plain module rather than the `.remote.ts` file because remote
 * modules may only export remote functions, and two of the three callers here are
 * not one.
 */
const COOKIE = 'fann_pending_company';
const MAX_AGE = 60 * 60 * 24 * 7;

export function setPendingCompanyName(name: string): void {
	getRequestEvent().cookies.set(COOKIE, name, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: secureCookies,
		maxAge: MAX_AGE
	});
}

export function readPendingCompanyName(): string {
	return getRequestEvent().cookies.get(COOKIE) ?? '';
}

/** Called once the company exists, so a later visit does not see a stale name. */
export function clearPendingCompanyName(): void {
	getRequestEvent().cookies.delete(COOKIE, { path: '/' });
}
