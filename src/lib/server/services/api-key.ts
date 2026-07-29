import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { apiKeys } from '../db/schema/api';

/**
 * API keys.
 *
 * Same shape as an invite token in `team.ts` and a session in `session.ts`, and
 * for the same reason: **only the hash is stored**. The plaintext is returned
 * once, from `issue`, and cannot be recovered afterwards. A key this table could
 * reveal is one that a database backup hands to whoever reads it.
 *
 * A key authenticates a **system belonging to an organization**, not a person.
 * Binding it to a user account would mean it stopped working the day they left —
 * or, worse, kept their access after.
 */

/** Recognisable in a log or a config file, and greppable in a leak. */
const PREFIX = 'fann_sk_';

function hash(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export interface IssuedKey {
	id: string;
	name: string;
	/** Shown once. Never stored, never recoverable. */
	token: string;
}

export async function issue(
	organizationId: string,
	name: string,
	createdByUserId: string
): Promise<IssuedKey> {
	const label = name.trim();
	if (!label) error(400, 'Give the key a name, so you can tell which one to revoke later.');

	const token = `${PREFIX}${randomBytes(32).toString('base64url')}`;

	const [row] = await db
		.insert(apiKeys)
		.values({
			organizationId,
			name: label,
			tokenHash: hash(token),
			// Enough to recognise a key in a list, far short of enough to use one.
			prefix: token.slice(0, PREFIX.length + 6),
			createdByUserId
		})
		.returning();

	return { id: row.id, name: row.name, token };
}

export interface ApiKeyRow {
	id: string;
	name: string;
	prefix: string;
	createdAt: Date;
	lastUsedAt: Date | null;
	revokedAt: Date | null;
}

export async function listFor(organizationId: string): Promise<ApiKeyRow[]> {
	return db
		.select({
			id: apiKeys.id,
			name: apiKeys.name,
			prefix: apiKeys.prefix,
			createdAt: apiKeys.createdAt,
			lastUsedAt: apiKeys.lastUsedAt,
			revokedAt: apiKeys.revokedAt
		})
		.from(apiKeys)
		.where(eq(apiKeys.organizationId, organizationId))
		.orderBy(desc(apiKeys.createdAt));
}

/**
 * Revoked, never deleted.
 *
 * "This key was live between these dates and then somebody turned it off" is the
 * question asked after an incident, and a deleted row cannot answer it. Scoped to
 * the organization in the same statement so naming somebody else's key id does
 * nothing at all.
 */
export async function revoke(organizationId: string, keyId: string): Promise<void> {
	await db
		.update(apiKeys)
		.set({ revokedAt: new Date() })
		.where(
			and(
				eq(apiKeys.id, keyId),
				eq(apiKeys.organizationId, organizationId),
				isNull(apiKeys.revokedAt)
			)
		);
}

/**
 * Resolve a bearer token to the organization it may act for, or null.
 *
 * Looked up by hash, which is a single indexed equality — there is no scan and no
 * per-row comparison to time. The `timingSafeEqual` below guards the one
 * comparison that remains, because a unique index lookup still returns a row
 * whose hash must be checked to be exactly right.
 *
 * `lastUsedAt` is written on success and deliberately not awaited by the caller's
 * critical path — it answers "is anyone still using this" before somebody
 * revokes a key, and a slow write must not slow every API request.
 */
export interface ResolvedKey {
	organizationId: string;
	/**
	 * Who created the key.
	 *
	 * Carried because some writes need an author. A job posted or a comment made
	 * through the API is still something a person is answerable for, and this is
	 * the only person the request can honestly be attributed to — the one who
	 * issued the credential. Null only if that account has since been closed.
	 */
	createdByUserId: string | null;
}

export async function resolve(token: string | null | undefined): Promise<ResolvedKey | null> {
	if (!token || !token.startsWith(PREFIX)) return null;

	const digest = hash(token);

	const [row] = await db
		.select({
			id: apiKeys.id,
			organizationId: apiKeys.organizationId,
			createdByUserId: apiKeys.createdByUserId,
			tokenHash: apiKeys.tokenHash,
			revokedAt: apiKeys.revokedAt
		})
		.from(apiKeys)
		.where(eq(apiKeys.tokenHash, digest))
		.limit(1);

	if (!row) return null;

	const a = Buffer.from(row.tokenHash);
	const b = Buffer.from(digest);
	if (a.byteLength !== b.byteLength || !timingSafeEqual(a, b)) return null;

	// A revoked key is refused here rather than filtered in the query, so the
	// reason a request failed is a decision this function made rather than an
	// absent row that could equally have meant "never existed".
	if (row.revokedAt) return null;

	void db
		.update(apiKeys)
		.set({ lastUsedAt: new Date() })
		.where(eq(apiKeys.id, row.id))
		.catch((cause) => console.error('Could not stamp api key use', cause));

	return { organizationId: row.organizationId, createdByUserId: row.createdByUserId };
}

/** Pulls the token out of `Authorization: Bearer …`. */
export function bearerFrom(request: Request): string | null {
	const header = request.headers.get('authorization');
	if (!header) return null;

	const [scheme, value] = header.split(' ');
	if (scheme?.toLowerCase() !== 'bearer' || !value) return null;

	return value.trim();
}
