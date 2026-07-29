import { error, json } from '@sveltejs/kit';
import { bearerFrom, resolve, type ResolvedKey } from '#lib/server/services/api-key';

/**
 * Shared authentication for the public API.
 *
 * Not `hooks.server.ts` and not a route group: `/api/v1` is the only thing in the
 * product authenticated by a bearer token rather than a session cookie, and
 * putting that in the global handle would mean every page request paid for a
 * check that only these routes need — and that a mistake in the group's shape
 * could silently skip.
 *
 * There is no cookie fallback. A browser session must never authenticate this
 * API, or any page on the internet could make a candidate's browser read their
 * employer's applications simply by fetching a URL.
 */
export async function requireApiKey(request: Request): Promise<ResolvedKey> {
	const key = await resolve(bearerFrom(request));

	// One message for missing, malformed, revoked and unknown. Telling somebody
	// which of those it was is telling them whether a key they are guessing at
	// exists.
	if (!key) {
		error(401, 'Provide a valid API key as `Authorization: Bearer <key>`.');
	}

	return key;
}

/** Every response from the API, shaped the same way. */
export function apiJson(data: unknown, init: ResponseInit = {}): Response {
	return json(data, {
		...init,
		headers: {
			// Somebody's hiring data. Nothing between here and them may keep a copy.
			'cache-control': 'no-store',
			...init.headers
		}
	});
}

/** `?limit=` with a ceiling, so one caller cannot ask for the whole table. */
export function limitFrom(url: URL, fallback = 50, max = 200): number {
	const raw = Number(url.searchParams.get('limit'));
	if (!Number.isFinite(raw) || raw <= 0) return fallback;
	return Math.min(Math.floor(raw), max);
}

/**
 * Parse a JSON body, or fail with a message a program can act on.
 *
 * `request.json()` throws a SyntaxError on malformed input, which would surface
 * as a 500 — an integration bug reported as our outage.
 */
export async function readJson(request: Request): Promise<unknown> {
	const type = request.headers.get('content-type') ?? '';
	if (!type.includes('application/json')) {
		error(415, 'Send `Content-Type: application/json`.');
	}

	try {
		return await request.json();
	} catch {
		error(400, 'That body is not valid JSON.');
	}
}

/**
 * A validation failure, shaped for a program.
 *
 * Returned rather than thrown: Kit's `error()` carries a single string, so the
 * field paths would arrive as JSON encoded inside a message string — something
 * the caller has to unwrap twice and cannot rely on. This is the one place the
 * API answers with a body of its own design.
 */
export function apiInvalid(issues: Record<string, unknown>): Response {
	return apiJson({ error: 'invalid_request', fields: issues }, { status: 400 });
}
