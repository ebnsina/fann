import * as v from 'valibot';
import { command, query } from '$app/server';
import { requireUser } from '#lib/server/auth/guards';
import * as notification from '#lib/server/services/notification';

/**
 * The notification centre.
 *
 * Every function here starts from the session's own user id and never takes one
 * as an argument. These endpoints are reachable as raw HTTP, so an id in the
 * request would be an invitation to read somebody else's bell — and the id is
 * never a thing the caller knows better than the server does.
 */

export const unreadNotifications = query(async () => {
	const user = requireUser();
	return notification.unreadCount(user.id);
});

export const notificationList = query(
	v.optional(v.object({ before: v.optional(v.string()) }), {}),
	async ({ before }) => {
		const user = requireUser();

		return notification.listFor(user.id, {
			before: before ? new Date(before) : null
		});
	}
);

export const notificationSettings = query(async () => {
	const user = requireUser();
	return notification.preferencesFor(user.id);
});

export const markNotificationsRead = command(
	v.object({ ids: v.array(v.pipe(v.string(), v.uuid())) }),
	async ({ ids }) => {
		const user = requireUser();
		await notification.markRead(user.id, ids);

		await Promise.all([unreadNotifications().refresh(), notificationList().refresh()]);

		return { ok: true };
	}
);

export const markAllNotificationsRead = command(async () => {
	const user = requireUser();
	await notification.markAllRead(user.id);

	await Promise.all([unreadNotifications().refresh(), notificationList().refresh()]);

	return { ok: true };
});

/**
 * Turn email for one category on or off.
 *
 * A `command` rather than a `form`, because the switch **is** the interaction —
 * putting a save button next to a toggle asks for a second decision nobody made.
 * The unsubscribe route covers the no-JavaScript path, and it is the one that
 * actually needs to work without a session.
 */
export const setNotificationEmailPreference = command(
	v.object({
		category: v.picklist(notification.OPTIONAL_CATEGORIES),
		enabled: v.boolean()
	}),
	async ({ category, enabled }) => {
		const user = requireUser();

		await notification.setEmailEnabled(user.id, category, enabled);
		await notificationSettings().refresh();

		return { saved: true };
	}
);
