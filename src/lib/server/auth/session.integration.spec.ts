import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { sessions, users } from '../db/schema/identity';
import {
	createSession,
	deleteExpiredSessions,
	invalidateSession,
	invalidateUserSessions,
	validateSession
} from './session';

/**
 * Exercises the session layer against a real Postgres, because the behaviour worth
 * testing here — hashing at rest, sliding renewal, cascade on delete — lives in the
 * interaction with the database, not in the TypeScript.
 *
 * Skips itself when no database is reachable so `pnpm test` still passes on a
 * machine that has not run `pnpm db:setup`.
 */
const reachable = await db
	.execute('select 1')
	.then(() => true)
	.catch(() => false);

describe.skipIf(!reachable)('session lifecycle', () => {
	let userId: string;

	beforeAll(async () => {
		const [user] = await db
			.insert(users)
			.values({
				email: `session-test-${Date.now()}@example.test`,
				name: 'Session Test',
				passwordHash: 'unused'
			})
			.returning();
		userId = user.id;
	});

	afterAll(async () => {
		await db.delete(users).where(eq(users.id, userId));
	});

	it('stores only a hash of the token, never the token itself', async () => {
		const { token } = await createSession(userId);

		const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect(row.tokenHash).not.toBe(token);
			expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
		}
	});

	it('resolves a valid token to its user', async () => {
		const { token } = await createSession(userId);
		const context = await validateSession(token);

		expect(context?.user.id).toBe(userId);
	});

	it('rejects a token that was never issued', async () => {
		expect(await validateSession('not-a-real-token')).toBeNull();
	});

	it('rejects an expired session and cleans it up', async () => {
		const { token } = await createSession(userId);
		const before = await validateSession(token);
		expect(before).not.toBeNull();

		await db
			.update(sessions)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(sessions.id, before!.session.id));

		expect(await validateSession(token)).toBeNull();
		const [gone] = await db.select().from(sessions).where(eq(sessions.id, before!.session.id));
		expect(gone).toBeUndefined();
	});

	it('slides the expiry once past the halfway mark', async () => {
		const { token } = await createSession(userId);
		const first = await validateSession(token);

		// Push the expiry to just inside the renewal window (15 days is halfway of 30).
		const nearExpiry = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
		await db
			.update(sessions)
			.set({ expiresAt: nearExpiry })
			.where(eq(sessions.id, first!.session.id));

		const renewed = await validateSession(token);
		expect(renewed!.session.expiresAt.getTime()).toBeGreaterThan(nearExpiry.getTime());
	});

	it('does not slide an expiry that is still comfortably ahead', async () => {
		const { token } = await createSession(userId);
		const first = await validateSession(token);
		const originalExpiry = first!.session.expiresAt.getTime();

		const again = await validateSession(token);
		expect(again!.session.expiresAt.getTime()).toBe(originalExpiry);
	});

	it('refuses a session whose user has been deactivated, and drops every session', async () => {
		const { token } = await createSession(userId);
		await db.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, userId));

		expect(await validateSession(token)).toBeNull();
		expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);

		await db.update(users).set({ deactivatedAt: null }).where(eq(users.id, userId));
	});

	it('invalidates a single session without touching the others', async () => {
		const a = await createSession(userId);
		const b = await createSession(userId);

		const contextA = await validateSession(a.token);
		await invalidateSession(contextA!.session.id);

		expect(await validateSession(a.token)).toBeNull();
		expect(await validateSession(b.token)).not.toBeNull();
	});

	it('invalidates every session for a user — the password-change path', async () => {
		await createSession(userId);
		const { token } = await createSession(userId);

		await invalidateUserSessions(userId);

		expect(await validateSession(token)).toBeNull();
		expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
	});

	it('sweeps expired rows and leaves live ones alone', async () => {
		const live = await createSession(userId);
		const stale = await createSession(userId);
		const staleContext = await validateSession(stale.token);

		await db
			.update(sessions)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(sessions.id, staleContext!.session.id));

		await deleteExpiredSessions();

		expect(await validateSession(live.token)).not.toBeNull();
	});

	it('cascades session deletion when the user is removed', async () => {
		const [temp] = await db
			.insert(users)
			.values({
				email: `cascade-test-${Date.now()}@example.test`,
				name: 'Cascade Test'
			})
			.returning();

		await createSession(temp.id);
		await db.delete(users).where(eq(users.id, temp.id));

		expect(await db.select().from(sessions).where(eq(sessions.userId, temp.id))).toHaveLength(0);
	});
});
