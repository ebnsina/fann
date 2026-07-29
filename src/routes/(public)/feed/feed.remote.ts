import * as v from 'valibot';
import { command, form, getRequestEvent, query } from '$app/server';
import { requireUser, requireVerifiedUser } from '#lib/server/auth/guards';
import { RULES, enforce } from '#lib/server/rate-limit';
import * as moderation from '#lib/server/services/moderation';
import * as social from '#lib/server/services/social';

/**
 * The public feed.
 *
 * Reading needs no account — a feed nobody can see without signing up is a wall,
 * and the point of it is that a candidate can see what a company is like before
 * deciding to deal with them. Writing needs a verified one, for the same reason
 * applying does: anything posted here has somebody's name on it.
 */

const uuid = v.pipe(v.string(), v.uuid());

/**
 * The two argument shapes the feed page actually asks for.
 *
 * `query(...).refresh()` is keyed by its argument, so `posts()` refreshes a cache
 * entry nobody is rendering — the page calls `posts({ followingOnly, before })`.
 * Every mutation below refreshes both tabs through this, because liking something
 * in one tab must not leave a stale count in the other.
 */
const FEED_VIEWS = [
	{ followingOnly: false, before: '' },
	{ followingOnly: true, before: '' }
] as const;

async function refreshFeeds() {
	await Promise.all(FEED_VIEWS.map((view) => posts(view).refresh()));
}

export const posts = query(
	v.optional(
		v.object({
			followingOnly: v.optional(v.boolean(), false),
			/** ISO timestamp of the oldest row already shown. */
			before: v.optional(v.string(), '')
		}),
		{}
	),
	async (options) => {
		const { locals } = getRequestEvent();

		return social.feed({
			viewerId: locals.user?.id ?? null,
			followingOnly: options?.followingOnly ?? false,
			before: options?.before ? new Date(options.before) : null
		});
	}
);

/** Companies the signed-in person may post as. Empty for most people. */
export const postingIdentities = query(async () => {
	const { locals } = getRequestEvent();
	if (!locals.user) return [];

	return social.companiesForAuthor(locals.user.id);
});

const composeSchema = v.object({
	body: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty('Write something first.'),
		v.maxLength(5000, 'That is longer than a post should be.')
	),
	/** Empty string means "as myself", which is how a select sends no company. */
	companyId: v.optional(v.union([v.literal(''), uuid]), '')
});

export const createPost = form(composeSchema, async ({ body, companyId }) => {
	const user = requireVerifiedUser();

	// Bounded per account. Posting is cheap for a person and cheaper to automate,
	// and this one is public the moment it lands.
	await enforce(RULES.post, [`user:${user.id}`]);

	await social.createPost({ authorUserId: user.id, body, companyId: companyId || null });
	await refreshFeeds();

	return { posted: true };
});

export const removePost = command(uuid, async (postId) => {
	const user = requireUser();
	await social.deletePost(postId, user.id);
	await refreshFeeds();
	return { removed: true };
});

export const toggleLike = command(uuid, async (postId) => {
	const user = requireVerifiedUser();
	const result = await social.toggleLike(postId, user.id);
	await refreshFeeds();
	return result;
});

export const comments = query(uuid, async (postId) => {
	const { locals } = getRequestEvent();
	return social.commentsFor(postId, locals.user?.id ?? null);
});

export const addComment = command(
	v.object({
		postId: uuid,
		body: v.pipe(v.string(), v.trim(), v.nonEmpty('Write something first.'), v.maxLength(2000))
	}),
	async ({ postId, body }) => {
		const user = requireVerifiedUser();
		await enforce(RULES.post, [`user:${user.id}`]);

		await social.addComment(postId, user.id, body);
		await Promise.all([comments(postId).refresh(), refreshFeeds()]);

		return { added: true };
	}
);

export const removeComment = command(
	v.object({ commentId: uuid, postId: uuid }),
	async ({ commentId, postId }) => {
		const user = requireUser();
		await social.deleteComment(commentId, user.id);
		await Promise.all([comments(postId).refresh(), refreshFeeds()]);
		return { removed: true };
	}
);

/**
 * Flag something.
 *
 * Verified, because an unverified account is free to make and a report that
 * costs nothing is a heckler's veto — three throwaway addresses would otherwise
 * hide anything.
 */
export const reportContent = command(
	v.object({
		postId: v.optional(uuid),
		commentId: v.optional(uuid),
		reason: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)), '')
	}),
	async ({ postId, commentId, reason }) => {
		const user = requireVerifiedUser();

		const result = await social.report({ postId, commentId }, user.id, reason);
		await refreshFeeds();

		return result;
	}
);

/* -- Following ----------------------------------------------------------- */

const followTarget = v.object({
	userId: v.optional(uuid),
	companyId: v.optional(uuid)
});

export const following = query(followTarget, async (target) => {
	const { locals } = getRequestEvent();
	if (!locals.user) return false;

	return social.isFollowing(locals.user.id, target);
});

export const toggleFollow = command(followTarget, async (target) => {
	const user = requireUser();

	const already = await social.isFollowing(user.id, target);
	if (already) await social.unfollow(user.id, target);
	else await social.follow(user.id, target);

	await Promise.all([following(target).refresh(), refreshFeeds()]);
	return { following: !already };
});

/* -- Moderating your own threads ----------------------------------------- */

/**
 * Whether the viewer may hide replies under this post.
 *
 * True for the company that published it, and for platform staff. Drives the
 * controls; `setCommentHidden` is what actually decides.
 */
export const canModerate = query(uuid, async (postId) => {
	const { locals } = getRequestEvent();
	if (!locals.user) return false;

	return moderation.canModerate(postId, locals.user.id);
});

export const hideComment = command(
	v.object({ commentId: uuid, postId: uuid, hidden: v.boolean() }),
	async ({ commentId, postId, hidden }) => {
		const user = requireUser();

		await moderation.setCommentHidden(commentId, user.id, hidden);
		await Promise.all([comments(postId).refresh(), refreshFeeds()]);

		return { hidden };
	}
);
