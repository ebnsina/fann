import { eq, like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { users } from '../db/schema/identity';
import { authenticate, findByEmail, signup, verifyEmail } from './auth';
import { issueEmailToken } from '../auth/tokens';

/**
 * Covers the account lifecycle against a real database. Skips when none is
 * reachable so `pnpm test` still passes without `pnpm db:setup`.
 */
const reachable = await db
	.execute('select 1')
	.then(() => true)
	.catch(() => false);

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'a-long-enough-password';

describe.skipIf(!reachable)('signup and authentication', () => {
	afterAll(async () => {
		await db.delete(users).where(like(users.email, 'svc-test-%@example.test'));
	});

	function freshEmail(): string {
		return `svc-test-${crypto.randomUUID()}@example.test`;
	}

	it('creates a user with a hashed password and no verification yet', async () => {
		const email = freshEmail();
		const user = await signup({ name: 'Ada Lovelace', email, password: PASSWORD }, ORIGIN);

		expect(user.email).toBe(email);
		expect(user.passwordHash).not.toBe(PASSWORD);
		expect(user.passwordHash).toMatch(/^\$argon2id\$/);
		expect(user.emailVerifiedAt).toBeNull();
	});

	it('authenticates with the right password and rejects the wrong one', async () => {
		const email = freshEmail();
		await signup({ name: 'Grace Hopper', email, password: PASSWORD }, ORIGIN);

		expect(await authenticate(email, PASSWORD)).not.toBeNull();
		expect(await authenticate(email, 'wrong-password-entirely')).toBeNull();
	});

	it('returns null for an address that was never registered', async () => {
		expect(await authenticate(freshEmail(), PASSWORD)).toBeNull();
	});

	it('does not create a second account for an existing address', async () => {
		const email = freshEmail();
		const first = await signup({ name: 'Ada', email, password: PASSWORD }, ORIGIN);
		const second = await signup({ name: 'Impostor', email, password: 'another-password' }, ORIGIN);

		// Same row returned, and the original password still works — a duplicate
		// signup must never overwrite the real owner's credentials.
		expect(second.id).toBe(first.id);
		expect(await authenticate(email, PASSWORD)).not.toBeNull();
	});

	it('verifies an email exactly once', async () => {
		const email = freshEmail();
		const user = await signup({ name: 'Alan Turing', email, password: PASSWORD }, ORIGIN);

		const { token } = await issueEmailToken(user.id, 'email_verification');
		expect(await verifyEmail(token)).toBe(true);

		const updated = await findByEmail(email);
		expect(updated?.emailVerifiedAt).toBeInstanceOf(Date);

		// Replaying the same link must not succeed.
		expect(await verifyEmail(token)).toBe(false);
	});

	it('refuses a deactivated account even with the right password', async () => {
		const email = freshEmail();
		const user = await signup({ name: 'Deactivated', email, password: PASSWORD }, ORIGIN);
		await db.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, user.id));

		expect(await authenticate(email, PASSWORD)).toBeNull();
	});
});
