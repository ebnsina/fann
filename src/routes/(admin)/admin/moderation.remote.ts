import * as v from 'valibot';
import { command, query } from '$app/server';
import { requireUser } from '#lib/server/auth/guards';
import * as moderation from '#lib/server/services/moderation';

/**
 * The platform moderation queue.
 *
 * Guarded inside the service rather than by the route group. Remote functions are
 * reachable as raw HTTP endpoints, so being under `(admin)` protects nothing —
 * `queue` and `dismiss` check staff status themselves, and deny as not-found so
 * the existence of the queue is not confirmed to somebody probing for it.
 */
const uuid = v.pipe(v.string(), v.uuid());

export const openReports = query(async () => {
	const user = requireUser();
	return moderation.queue(user.id);
});

const target = v.object({ postId: v.optional(uuid), commentId: v.optional(uuid) });

export const takeDown = command(target, async ({ postId, commentId }) => {
	const user = requireUser();

	if (postId) await moderation.setPostHidden(postId, user.id, true);
	else await moderation.setCommentHidden(commentId!, user.id, true);

	await openReports().refresh();
	return { hidden: true };
});

export const leaveUp = command(target, async ({ postId, commentId }) => {
	const user = requireUser();

	await moderation.dismiss({ postId, commentId }, user.id);
	await openReports().refresh();

	return { dismissed: true };
});
