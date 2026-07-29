import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { notifications } from '../db/schema/notification';
import { createUser, databaseReachable, deleteFixtureUsers } from '../testing/fixtures';
import {
	emailEnabled,
	listFor,
	markAllRead,
	markRead,
	preferencesFor,
	record,
	setEmailEnabled,
	unreadCount,
	unsubscribeToken,
	unsubscribeWithToken
} from './notification';

const SUITE = 'notification';

describe.skipIf(!databaseReachable)('notifications', () => {
	let userId: string;
	let otherId: string;

	beforeAll(async () => {
		userId = (await createUser(SUITE)).id;
		otherId = (await createUser(SUITE)).id;
	});

	afterAll(async () => {
		await deleteFixtureUsers(SUITE);
	});

	it('records the notification even when the email is muted', async () => {
		await setEmailEnabled(userId, 'application', false);

		const { emailAllowed } = await record({
			userId,
			category: 'application',
			tag: 'application.rejected',
			title: 'An update on your application'
		});

		// The point of the whole design: muting email must not mute the product's
		// own memory. A candidate who turned email off must still be able to sign in
		// and find out they were turned down.
		expect(emailAllowed).toBe(false);

		const rows = await listFor(userId);
		expect(rows.some((row) => row.title === 'An update on your application')).toBe(true);

		await setEmailEnabled(userId, 'application', true);
	});

	it('treats a missing preference row as enabled', async () => {
		// Defaulting to off would silently stop every existing account hearing back
		// the moment this shipped, which is indistinguishable from an employer who
		// went quiet — the one confusion this product cannot afford.
		expect(await emailEnabled(otherId, 'application')).toBe(true);

		const prefs = await preferencesFor(otherId);
		expect(prefs.every((pref) => pref.email)).toBe(true);
	});

	it('never offers a switch for account email', async () => {
		const prefs = await preferencesFor(userId);

		// Verification and password reset are the user pressing a button and waiting.
		expect(prefs.map((pref) => pref.category)).not.toContain('account');
		await expect(setEmailEnabled(userId, 'account', false)).rejects.toThrow();
		expect(await emailEnabled(userId, 'account')).toBe(true);
	});

	it('stores only the exceptions, so enabling removes the row', async () => {
		await setEmailEnabled(userId, 'social', false);
		expect(await emailEnabled(userId, 'social')).toBe(false);

		await setEmailEnabled(userId, 'social', true);
		expect(await emailEnabled(userId, 'social')).toBe(true);

		// Enabling twice must not fail, and muting twice must not duplicate.
		await setEmailEnabled(userId, 'social', true);
		await setEmailEnabled(userId, 'social', false);
		await setEmailEnabled(userId, 'social', false);
		expect(await emailEnabled(userId, 'social')).toBe(false);
		await setEmailEnabled(userId, 'social', true);
	});

	it('counts and clears unread for one person only', async () => {
		await db.delete(notifications).where(eq(notifications.userId, userId));
		await db.delete(notifications).where(eq(notifications.userId, otherId));

		await record({ userId, category: 'offer', tag: 'offer.sent', title: 'You have an offer' });
		await record({ userId, category: 'team', tag: 'team.invite', title: 'You were invited' });
		await record({ userId: otherId, category: 'offer', tag: 'offer.sent', title: 'Theirs' });

		expect(await unreadCount(userId)).toBe(2);

		const [first] = await listFor(userId);
		await markRead(userId, [first.id]);
		expect(await unreadCount(userId)).toBe(1);

		await markAllRead(userId);
		expect(await unreadCount(userId)).toBe(0);

		// The other person's notification is untouched by any of it.
		expect(await unreadCount(otherId)).toBe(1);
	});

	it('refuses to mark somebody else’s notification read', async () => {
		const [theirs] = await listFor(otherId);

		// Scoped in the statement rather than checked first, so naming an id you do
		// not own changes nothing at all.
		await markRead(userId, [theirs.id]);

		expect(await unreadCount(otherId)).toBe(1);
	});

	describe('unsubscribe links', () => {
		it('switches the category off without a session', async () => {
			const token = unsubscribeToken(userId, 'interview');

			const result = await unsubscribeWithToken(token);

			expect(result?.category).toBe('interview');
			expect(await emailEnabled(userId, 'interview')).toBe(false);

			await setEmailEnabled(userId, 'interview', true);
		});

		it('rejects a token aimed at an id somebody guessed', async () => {
			const token = unsubscribeToken(userId, 'offer');
			// Same shape, different victim — this is the attack the HMAC exists for.
			const forged = token.replace(userId, otherId);

			expect(await unsubscribeWithToken(forged)).toBeNull();
			expect(await emailEnabled(otherId, 'offer')).toBe(true);
		});

		it('rejects a tampered signature and a malformed token', async () => {
			const token = unsubscribeToken(userId, 'team');

			expect(await unsubscribeWithToken(`${token}x`)).toBeNull();
			expect(await unsubscribeWithToken('nonsense')).toBeNull();
			expect(await unsubscribeWithToken(`${userId}.team.`)).toBeNull();
			expect(await emailEnabled(userId, 'team')).toBe(true);
		});

		it('cannot be used to switch account email off', async () => {
			// `account` is not in the optional list, so no token for it is ever valid —
			// otherwise a leaked link could lock somebody out of their own reset email.
			expect(await unsubscribeWithToken(unsubscribeToken(userId, 'account'))).toBeNull();
			expect(await emailEnabled(userId, 'account')).toBe(true);
		});
	});
});
