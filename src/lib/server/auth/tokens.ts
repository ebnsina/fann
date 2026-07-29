import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { emailTokens } from '../db/schema/identity';

export type EmailTokenPurpose = 'email_verification' | 'password_reset';

/** One hour. Long enough to find the email, short enough to limit a leaked inbox. */
const TTL_MS = 60 * 60 * 1000;

/**
 * Only the hash is ever stored. A leaked table then yields nothing usable, which
 * is the same reason passwords are not stored either.
 *
 * Exported because invitations follow the same shape — see `services/team.ts`.
 */
export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** 32 bytes of randomness, URL-safe. The plaintext only ever goes in an email. */
export function randomToken(): string {
	return randomBytes(32).toString('base64url');
}

/**
 * Issue a single-use token and return the plaintext, which is only ever put in an
 * email. Existing unconsumed tokens for the same purpose are invalidated first, so
 * requesting a new reset link reliably kills the old one.
 */
export async function issueEmailToken(
	userId: string,
	purpose: EmailTokenPurpose
): Promise<{ token: string; expiresAt: Date }> {
	await db
		.delete(emailTokens)
		.where(
			and(
				eq(emailTokens.userId, userId),
				eq(emailTokens.purpose, purpose),
				isNull(emailTokens.consumedAt)
			)
		);

	const token = randomToken();
	const expiresAt = new Date(Date.now() + TTL_MS);

	await db.insert(emailTokens).values({
		userId,
		purpose,
		tokenHash: hashToken(token),
		expiresAt
	});

	return { token, expiresAt };
}

/**
 * Redeem a token, returning the user id it belonged to, or null.
 *
 * The update is conditional on the token still being unconsumed, and the row count
 * decides the outcome — so two simultaneous redemptions of the same link cannot
 * both succeed.
 */
export async function consumeEmailToken(
	token: string,
	purpose: EmailTokenPurpose
): Promise<string | null> {
	const rows = await db
		.update(emailTokens)
		.set({ consumedAt: new Date() })
		.where(
			and(
				eq(emailTokens.tokenHash, hashToken(token)),
				eq(emailTokens.purpose, purpose),
				isNull(emailTokens.consumedAt)
			)
		)
		.returning({ userId: emailTokens.userId, expiresAt: emailTokens.expiresAt });

	const [row] = rows;
	if (!row) return null;
	if (row.expiresAt.getTime() <= Date.now()) return null;

	return row.userId;
}
