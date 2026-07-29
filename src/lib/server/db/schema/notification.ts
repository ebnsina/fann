import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { baseColumns, primaryKeyColumn } from './_shared';
import { users } from './identity';

/**
 * What a notification is about.
 *
 * Deliberately coarse. A preference screen listing thirty toggles is one nobody
 * reads, and the honest granularity here is "the kind of thing this is", not the
 * individual message. The category is also what an unsubscribe link switches off,
 * so it has to be something a person can recognise from the email they are
 * holding.
 */
export const notificationCategoryEnum = pgEnum('notification_category', [
	/** Something happened to an application you sent. */
	'application',
	/** An interview was booked, moved or cancelled. */
	'interview',
	/** An offer was sent, or is about to expire. */
	'offer',
	/** Invitations and membership changes for a company you belong to. */
	'team',
	/** Replies and follows on things you posted. */
	'social',
	/**
	 * Sign-in, verification, password and closure.
	 *
	 * Never optional, and there is no preference row for it — see
	 * `notificationPreferences`. These messages are the ones somebody asked for by
	 * pressing a button, and an account with no way to prove ownership is not a
	 * feature, it is a lockout.
	 */
	'account'
]);

/**
 * The in-app record that something happened.
 *
 * Written for **every** notifiable event, whatever the email preferences say.
 * Preferences decide whether we also send an email; they never decide whether the
 * product remembers. A candidate who turned off email must still be able to open
 * the site and find out that they were turned down — that promise is the reason
 * this product exists, and hanging it on a mail provider would be a promise made
 * of somebody else's uptime.
 */
export const notifications = pgTable(
	'notifications',
	{
		...baseColumns,
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		category: notificationCategoryEnum('category').notNull(),
		/** Matches the email tag, e.g. `application.rejected`, for tracing a pair. */
		tag: text('tag').notNull(),
		/** One line, already written for a person. Never a template to fill in later. */
		title: text('title').notNull(),
		/** Optional second line. Plain text — this is never rendered as markdown. */
		body: text('body'),
		/** Where reading it takes you. Always an in-app path, never an absolute URL. */
		url: text('url'),
		entityType: text('entity_type'),
		entityId: uuid('entity_id'),
		readAt: timestamp('read_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		// The bell reads "newest first for me", and the unread count reads the same
		// rows, so one index serves both.
		index('notifications_user_idx').on(table.userId, table.createdAt),
		index('notifications_unread_idx').on(table.userId, table.readAt)
	]
);

/**
 * Which categories may also be emailed.
 *
 * A **missing row means enabled**. That is the whole reason this table only ever
 * stores the exceptions: defaulting to off would quietly break every existing
 * account the moment the feature shipped, and a candidate who stops hearing back
 * has no way to tell that from an employer who stopped replying — which is the one
 * confusion this product cannot afford.
 *
 * There is deliberately no row for `account`. Verification and password reset are
 * not marketing, they are the user pressing a button and waiting for the result,
 * so there is nothing to opt out of and no switch to render.
 */
export const notificationPreferences = pgTable(
	'notification_preferences',
	{
		...primaryKeyColumn,
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		category: notificationCategoryEnum('category').notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [uniqueIndex('notification_prefs_user_category_idx').on(table.userId, table.category)]
);
