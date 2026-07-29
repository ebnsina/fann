import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { STORAGE_SIGNING_SECRET } from '$app/env/private';
import { db } from '../db';
import {
	notificationPreferences,
	notifications,
	type notificationCategoryEnum
} from '../db/schema/notification';

/**
 * The notification centre.
 *
 * Two things happen when the product wants to tell somebody something, and they
 * are deliberately not the same thing:
 *
 * 1. A row is written here. Always. This is the product's own memory, and it is
 *    what makes "you were told" checkable rather than hopeful.
 * 2. An email may go out, if the person has not said otherwise for that category.
 *
 * Collapsing the two would mean a candidate who muted email also loses the record
 * of being rejected — and "every application gets an answer" would then quietly
 * depend on a mail provider staying up.
 */

export type NotificationCategory = (typeof notificationCategoryEnum.enumValues)[number];

/**
 * Categories a person may switch off.
 *
 * `account` is absent on purpose: verification and password reset are the user
 * pressing a button and waiting, so there is nothing to opt out of, and an
 * account you cannot prove you own is a lockout rather than a preference.
 */
export const OPTIONAL_CATEGORIES = [
	'application',
	'interview',
	'offer',
	'team',
	'social'
] as const satisfies readonly NotificationCategory[];

export const CATEGORY_LABELS: Record<(typeof OPTIONAL_CATEGORIES)[number], string> = {
	application: 'Updates on jobs you applied for',
	interview: 'Interview times and changes',
	offer: 'Offers',
	team: 'Invitations and changes to your companies',
	social: 'Replies and follows'
};

export interface NotificationInput {
	userId: string;
	category: NotificationCategory;
	tag: string;
	title: string;
	body?: string | null;
	/** In-app path. Kept relative so it cannot point somewhere else entirely. */
	url?: string | null;
	entityType?: string | null;
	entityId?: string | null;
}

/**
 * Record that somebody was notified, and say whether email should follow.
 *
 * Never throws for the same reason `deliver` does not: a notification is
 * something that happened *because* of work that already committed, and it must
 * not be able to roll that work back. A rejection that fails to write a bell
 * badge is still a rejection.
 */
export async function record(input: NotificationInput): Promise<{ emailAllowed: boolean }> {
	const emailAllowed = await emailEnabled(input.userId, input.category);

	try {
		await db.insert(notifications).values({
			userId: input.userId,
			category: input.category,
			tag: input.tag,
			title: input.title,
			body: input.body ?? null,
			url: input.url ?? null,
			entityType: input.entityType ?? null,
			entityId: input.entityId ?? null
		});
	} catch (cause) {
		console.error('Could not record a notification', { tag: input.tag, cause });
	}

	return { emailAllowed };
}

/** Whether this person still wants email for this category. Absent row = yes. */
export async function emailEnabled(
	userId: string,
	category: NotificationCategory
): Promise<boolean> {
	// `account` has no row and no switch — see OPTIONAL_CATEGORIES.
	if (category === 'account') return true;

	const [muted] = await db
		.select({ id: notificationPreferences.id })
		.from(notificationPreferences)
		.where(
			and(
				eq(notificationPreferences.userId, userId),
				eq(notificationPreferences.category, category)
			)
		)
		.limit(1);

	return !muted;
}

/** Every optional category and whether email is on, for the preferences screen. */
export type OptionalCategory = (typeof OPTIONAL_CATEGORIES)[number];

export async function preferencesFor(
	userId: string
): Promise<Array<{ category: OptionalCategory; label: string; email: boolean }>> {
	const muted = await db
		.select({ category: notificationPreferences.category })
		.from(notificationPreferences)
		.where(eq(notificationPreferences.userId, userId));

	const mutedSet = new Set(muted.map((row) => row.category));

	return OPTIONAL_CATEGORIES.map((category) => ({
		category,
		label: CATEGORY_LABELS[category],
		email: !mutedSet.has(category)
	}));
}

/**
 * Turn email for a category on or off.
 *
 * Enabling deletes the row rather than storing `true`, so "no row" keeps meaning
 * exactly one thing. Two representations of enabled is how a default silently
 * stops applying to the people who never touched the screen.
 */
export async function setEmailEnabled(
	userId: string,
	category: NotificationCategory,
	enabled: boolean
): Promise<void> {
	if (category === 'account') {
		throw new Error('Account emails cannot be switched off.');
	}

	if (enabled) {
		await db
			.delete(notificationPreferences)
			.where(
				and(
					eq(notificationPreferences.userId, userId),
					eq(notificationPreferences.category, category)
				)
			);
		return;
	}

	await db
		.insert(notificationPreferences)
		.values({ userId, category })
		.onConflictDoNothing({
			target: [notificationPreferences.userId, notificationPreferences.category]
		});
}

export interface NotificationRow {
	id: string;
	category: NotificationCategory;
	title: string;
	body: string | null;
	url: string | null;
	readAt: Date | null;
	createdAt: Date;
}

/** Newest first, keyset-paged on `created_at` for the same reason the feed is. */
export async function listFor(
	userId: string,
	options: { before?: Date | null; limit?: number } = {}
): Promise<NotificationRow[]> {
	const limit = Math.min(options.limit ?? 20, 50);

	return db
		.select({
			id: notifications.id,
			category: notifications.category,
			title: notifications.title,
			body: notifications.body,
			url: notifications.url,
			readAt: notifications.readAt,
			createdAt: notifications.createdAt
		})
		.from(notifications)
		.where(
			options.before
				? and(eq(notifications.userId, userId), lt(notifications.createdAt, options.before))
				: eq(notifications.userId, userId)
		)
		.orderBy(desc(notifications.createdAt))
		.limit(limit);
}

export async function unreadCount(userId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(notifications)
		.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

	return row?.count ?? 0;
}

/**
 * Mark specific notifications read.
 *
 * Scoped to the owner in the same statement rather than checked first: a caller
 * naming somebody else's id must change nothing, and a check-then-write leaves a
 * gap where it could.
 */
export async function markRead(userId: string, ids: string[]): Promise<void> {
	if (ids.length === 0) return;

	await db
		.update(notifications)
		.set({ readAt: new Date() })
		.where(
			and(
				eq(notifications.userId, userId),
				inArray(notifications.id, ids),
				isNull(notifications.readAt)
			)
		);
}

export async function markAllRead(userId: string): Promise<void> {
	await db
		.update(notifications)
		.set({ readAt: new Date() })
		.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

/**
 * One-click unsubscribe, signed rather than stored.
 *
 * The link is in an email, so it has to work for somebody who is not signed in
 * and may never have been — which rules out a session check. What it must not
 * become is a way to mute a stranger: the token is an HMAC over the pair, so it
 * cannot be constructed for an id somebody guessed, and it carries no secret of
 * its own to leak. It does not expire, because an unsubscribe link in a
 * three-month-old email is exactly the one somebody digs out when they have had
 * enough.
 *
 * It only ever switches a category **off**. A link that could switch things on
 * would be a way to re-subscribe someone who left.
 */
function signature(userId: string, category: NotificationCategory): string {
	return createHmac('sha256', STORAGE_SIGNING_SECRET)
		.update(`unsubscribe:${userId}:${category}`)
		.digest('base64url');
}

export function unsubscribeToken(userId: string, category: NotificationCategory): string {
	return `${userId}.${category}.${signature(userId, category)}`;
}

export function unsubscribeLink(
	origin: string,
	userId: string,
	category: NotificationCategory
): string {
	return `${origin}/unsubscribe/${unsubscribeToken(userId, category)}`;
}

/** Applies the token, or returns null when it is not authentic. */
export async function unsubscribeWithToken(
	token: string
): Promise<{ category: NotificationCategory; label: string } | null> {
	const parts = token.split('.');
	if (parts.length !== 3) return null;

	const [userId, category, provided] = parts;
	if (!(OPTIONAL_CATEGORIES as readonly string[]).includes(category)) return null;

	const expected = signature(userId, category as NotificationCategory);
	const a = Buffer.from(provided);
	const b = Buffer.from(expected);
	if (a.byteLength !== b.byteLength) return null;
	if (!timingSafeEqual(a, b)) return null;

	await setEmailEnabled(userId, category as NotificationCategory, false);

	return {
		category: category as NotificationCategory,
		label: CATEGORY_LABELS[category as (typeof OPTIONAL_CATEGORIES)[number]]
	};
}
