import { createHash } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/**
 * OWASP's argon2id baseline. Deliberately not configurable per call — a weaker
 * cost silently applied to one signup path is exactly the bug you never notice.
 */
const OPTIONS = {
	memoryCost: 19_456,
	timeCost: 2,
	parallelism: 1,
	outputLen: 32
} as const;

export function hashPassword(password: string): Promise<string> {
	return hash(password, OPTIONS);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
	return verify(passwordHash, password, OPTIONS);
}

/**
 * Argon2 verification against a throwaway hash, used when the email does not exist.
 *
 * Without it, a missing account returns in ~1ms and a real one in ~50ms, which is a
 * reliable account-enumeration oracle regardless of how carefully the error message
 * is worded.
 */
const DUMMY_HASH =
	'$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Ry6q0wGZKzk7pQNlDrKKuCg1yNGmRgFvDpMHgqcXFvA';

export async function fakeVerify(password: string): Promise<void> {
	try {
		await verify(DUMMY_HASH, password, OPTIONS);
	} catch {
		/* Always fails; we only want the elapsed time. */
	}
}

/**
 * Check a password against Have I Been Pwned using k-anonymity: only the first five
 * characters of the SHA-1 leave this process, so the password itself is never sent
 * and cannot be reconstructed from the request.
 *
 * Returns the number of breaches. Fails open — an outage at HIBP must not stop
 * people signing up.
 */
export async function countPasswordBreaches(password: string, fetchFn = fetch): Promise<number> {
	const digest = createHash('sha1').update(password).digest('hex').toUpperCase();
	const prefix = digest.slice(0, 5);
	const suffix = digest.slice(5);

	try {
		const response = await fetchFn(`https://api.pwnedpasswords.com/range/${prefix}`, {
			headers: { 'Add-Padding': 'true' },
			signal: AbortSignal.timeout(2500)
		});
		if (!response.ok) return 0;

		for (const line of (await response.text()).split('\n')) {
			const [candidate, count] = line.trim().split(':');
			if (candidate === suffix) return Number(count) || 0;
		}
	} catch {
		return 0;
	}

	return 0;
}
