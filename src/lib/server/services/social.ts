import { and, asc, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { companies } from '../db/schema/company';
import { users } from '../db/schema/identity';
import { orgMembers } from '../db/schema/org';
import {
	contentReports,
	follows,
	postComments,
	postLikes,
	posts,
	type Post
} from '../db/schema/social';

/**
 * Posts, comments, likes and follows.
 *
 * Rules that are not the UI's to enforce, because none of these endpoints is
 * reachable only through the UI:
 *
 *   - **Only an author edits or removes their own thing.** Soft-deleted, so a
 *     thread keeps its shape and a moderator can still see what was said.
 *   - **Posting as a company requires membership of that company's
 *     organization.** Otherwise the follow button is the least of the problems.
 *   - **A post hidden by moderation is not the same as one its author deleted**,
 *     and neither is a `DELETE`. Both states are recoverable and distinguishable.
 *   - **Reports are one per person per thing**, enforced by a unique index. A
 *     report count that one determined person can run up is a takedown button
 *     with extra steps.
 */

/**
 * How many distinct people must report something before it is hidden pending
 * review.
 *
 * There is no moderation console yet, so this is what stands between a live feed
 * and whatever somebody decides to paste into it. Three rather than one, because
 * a single report must never be able to silence anybody; low rather than high,
 * because with nobody watching the queue the alternative to acting early is not
 * acting at all. Hiding is reversible and recorded — deleting would not be.
 */
export const REPORTS_TO_HIDE = 3;

/** Everything a feed row needs, in one shape. */
export interface FeedPost {
	id: string;
	body: string;
	createdAt: Date;
	authorName: string;
	authorUserId: string;
	/** Set when the post speaks for a company rather than a person. */
	companyName: string | null;
	companySlug: string | null;
	likes: number;
	comments: number;
	likedByViewer: boolean;
	/** Whether the viewer may remove it — their own post, and nothing else. */
	ownedByViewer: boolean;
	/** False when the company behind the post has turned replies off. */
	interactionsAllowed: boolean;
	/** True when the company proved it owns its domain. */
	companyVerified: boolean;
}

/** Visible means: not deleted by its author, and not hidden by moderation. */
const visiblePost = and(isNull(posts.deletedAt), isNull(posts.hiddenAt));

function feedSelection(viewerId: string | null) {
	return {
		id: posts.id,
		body: posts.body,
		createdAt: posts.createdAt,
		authorUserId: posts.authorUserId,
		authorName: users.name,
		companyName: companies.name,
		companySlug: companies.slug,
		likes: sql<number>`(
			select count(*)::int from post_likes pl where pl.post_id = ${posts.id}
		)`,
		comments: sql<number>`(
			select count(*)::int from post_comments pc
			where pc.post_id = ${posts.id} and pc.deleted_at is null and pc.hidden_at is null
		)`,
		likedByViewer: viewerId
			? sql<boolean>`exists (
					select 1 from post_likes pl
					where pl.post_id = ${posts.id} and pl.user_id = ${viewerId}
				)`
			: sql<boolean>`false`,
		ownedByViewer: viewerId
			? sql<boolean>`${posts.authorUserId} = ${viewerId}`
			: sql<boolean>`false`,
		// A person's post has no company behind it, so there is nothing switched off.
		interactionsAllowed: sql<boolean>`coalesce(${companies.allowsInteraction}, true)`,
		// Only a company can be verified, so a person's post is never marked.
		companyVerified: sql<boolean>`exists (
			select 1 from organizations o
			where o.id = ${companies.organizationId} and o.domain_verified_at is not null
		)`
	};
}

export interface FeedOptions {
	viewerId: string | null;
	/** Newest-first, so a cursor is "older than this". */
	before?: Date | null;
	limit?: number;
	/** Only things the viewer follows. Requires a viewer. */
	followingOnly?: boolean;
}

/**
 * The feed.
 *
 * Keyset pagination on `created_at` rather than an offset: an offset re-reads
 * everything before it on every page, and shifts under the reader whenever
 * somebody posts — which on a newest-first feed is constantly.
 */
export async function feed(options: FeedOptions): Promise<FeedPost[]> {
	const { viewerId, before = null, limit = 20, followingOnly = false } = options;

	if (followingOnly && !viewerId) return [];

	const conditions = [visiblePost];
	if (before) conditions.push(lt(posts.createdAt, before));

	if (followingOnly && viewerId) {
		// Their own posts belong in their feed too — a timeline that hides what you
		// just wrote looks broken.
		conditions.push(
			or(
				eq(posts.authorUserId, viewerId),
				sql`exists (
					select 1 from follows f
					where f.follower_user_id = ${viewerId}
						and (
							f.following_user_id = ${posts.authorUserId}
							or f.following_company_id = ${posts.authorCompanyId}
						)
				)`
			)!
		);
	}

	return db
		.select(feedSelection(viewerId))
		.from(posts)
		.innerJoin(users, eq(users.id, posts.authorUserId))
		.leftJoin(companies, eq(companies.id, posts.authorCompanyId))
		.where(and(...conditions))
		.orderBy(desc(posts.createdAt))
		.limit(Math.min(limit, 50));
}

/** One company's posts, for its public page. */
export async function postsForCompany(
	companyId: string,
	viewerId: string | null,
	limit = 10
): Promise<FeedPost[]> {
	return db
		.select(feedSelection(viewerId))
		.from(posts)
		.innerJoin(users, eq(users.id, posts.authorUserId))
		.leftJoin(companies, eq(companies.id, posts.authorCompanyId))
		.where(and(visiblePost, eq(posts.authorCompanyId, companyId)))
		.orderBy(desc(posts.createdAt))
		.limit(limit);
}

export interface CreatePostInput {
	authorUserId: string;
	body: string;
	/** Post as this company. Membership is checked, not assumed. */
	companyId?: string | null;
}

export async function createPost(input: CreatePostInput): Promise<Post> {
	const body = input.body.trim();
	if (!body) error(400, 'Write something first.');

	if (input.companyId) await assertCanPostAs(input.companyId, input.authorUserId);

	const [row] = await db
		.insert(posts)
		.values({
			authorUserId: input.authorUserId,
			authorCompanyId: input.companyId ?? null,
			body
		})
		.returning();

	return row;
}

/**
 * Whether somebody may speak for a company.
 *
 * Membership of the organization that owns it — the same test the rest of the
 * employer side uses. Denied as not-found rather than forbidden, because
 * confirming which company an id belongs to is itself information.
 */
async function assertCanPostAs(companyId: string, userId: string): Promise<void> {
	const [row] = await db
		.select({ id: companies.id })
		.from(companies)
		.innerJoin(orgMembers, eq(orgMembers.organizationId, companies.organizationId))
		.where(and(eq(companies.id, companyId), eq(orgMembers.userId, userId)))
		.limit(1);

	if (!row) error(404, 'Not found.');
}

/** Companies this person may post as. Drives the composer's picker. */
export async function companiesForAuthor(userId: string) {
	return (
		db
			.select({ id: companies.id, name: companies.name })
			.from(companies)
			.innerJoin(orgMembers, eq(orgMembers.organizationId, companies.organizationId))
			// The `deletedAt` check is belt and braces: closing a company also deletes
			// its memberships, so a closed one already falls out of this join. Relying on
			// that alone couples "can I post as them" to an unrelated line in
			// `organization-account.ts`, and the day somebody closes a company without
			// clearing the team is the day a dead company reappears in this menu.
			.where(and(eq(orgMembers.userId, userId), isNull(companies.deletedAt)))
			// Alphabetical, because this is a menu somebody reads. Postgres returns rows
			// in whatever order suits it, which is fine for two companies and unusable
			// for twenty.
			.orderBy(asc(companies.name))
	);
}

/** Soft-delete, author only. */
export async function deletePost(postId: string, userId: string): Promise<void> {
	const removed = await db
		.update(posts)
		.set({ deletedAt: new Date() })
		.where(and(eq(posts.id, postId), eq(posts.authorUserId, userId), isNull(posts.deletedAt)))
		.returning({ id: posts.id });

	if (removed.length === 0) error(404, 'Not found.');
}

export async function toggleLike(postId: string, userId: string): Promise<{ liked: boolean }> {
	await assertCanInteract(postId, userId);

	const removed = await db
		.delete(postLikes)
		.where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)))
		.returning({ id: postLikes.id });

	if (removed.length > 0) return { liked: false };

	// `onConflictDoNothing` rather than a prior read: two taps in flight at once
	// would otherwise both see "not liked" and one would fail on the unique index.
	await db.insert(postLikes).values({ postId, userId }).onConflictDoNothing();
	return { liked: true };
}

/**
 * Whether the viewer may like or comment on a post.
 *
 * A company can switch interaction off for its own posts. Its own team is always
 * exempt — closing a thread to the public should not stop the people who wrote
 * the post from replying to each other under it.
 *
 * Enforced here rather than by hiding the buttons, because none of these
 * endpoints is reachable only through the UI. `interactionsAllowed` on the feed
 * row is what hides the buttons; this is what makes it true.
 */
async function assertCanInteract(postId: string, userId: string): Promise<void> {
	const [row] = await db
		.select({
			companyId: posts.authorCompanyId,
			allows: companies.allowsInteraction,
			isTeam: sql<boolean>`exists (
				select 1 from org_members m
				where m.organization_id = ${companies.organizationId} and m.user_id = ${userId}
			)`
		})
		.from(posts)
		.leftJoin(companies, eq(companies.id, posts.authorCompanyId))
		.where(eq(posts.id, postId))
		.limit(1);

	if (!row) error(404, 'Not found.');

	// A person's own post has no company behind it, so nothing to switch off.
	if (!row.companyId) return;
	if (row.allows || row.isTeam) return;

	error(403, 'This company has turned off replies on its posts.');
}

export interface FeedComment {
	id: string;
	body: string;
	createdAt: Date;
	authorName: string;
	ownedByViewer: boolean;
}

export async function commentsFor(postId: string, viewerId: string | null): Promise<FeedComment[]> {
	return db
		.select({
			id: postComments.id,
			body: postComments.body,
			createdAt: postComments.createdAt,
			authorName: users.name,
			ownedByViewer: viewerId
				? sql<boolean>`${postComments.authorUserId} = ${viewerId}`
				: sql<boolean>`false`
		})
		.from(postComments)
		.innerJoin(users, eq(users.id, postComments.authorUserId))
		.where(
			and(
				eq(postComments.postId, postId),
				isNull(postComments.deletedAt),
				isNull(postComments.hiddenAt)
			)
		)
		.orderBy(postComments.createdAt);
}

export async function addComment(postId: string, userId: string, body: string) {
	const text = body.trim();
	if (!text) error(400, 'Write something first.');

	// Commenting on something nobody can see is a way to find out it exists.
	const [post] = await db
		.select({ id: posts.id })
		.from(posts)
		.where(and(eq(posts.id, postId), visiblePost))
		.limit(1);

	if (!post) error(404, 'Not found.');

	await assertCanInteract(postId, userId);

	const [row] = await db
		.insert(postComments)
		.values({ postId, authorUserId: userId, body: text })
		.returning();

	return row;
}

export async function deleteComment(commentId: string, userId: string): Promise<void> {
	const removed = await db
		.update(postComments)
		.set({ deletedAt: new Date() })
		.where(
			and(
				eq(postComments.id, commentId),
				eq(postComments.authorUserId, userId),
				isNull(postComments.deletedAt)
			)
		)
		.returning({ id: postComments.id });

	if (removed.length === 0) error(404, 'Not found.');
}

/**
 * Flag something, and hide it once enough separate people have.
 *
 * The count and the hide happen in one transaction so two simultaneous reports
 * cannot both read a stale count and neither act on it.
 */
export async function report(
	target: { postId?: string; commentId?: string },
	reporterUserId: string,
	reason: string
): Promise<{ hidden: boolean }> {
	if (!target.postId === !target.commentId) error(400, 'Report one thing at a time.');

	return db.transaction(async (tx) => {
		await tx
			.insert(contentReports)
			.values({
				reporterUserId,
				postId: target.postId ?? null,
				commentId: target.commentId ?? null,
				reason: reason.trim() || 'Not given'
			})
			// Reporting twice is not two reports. The unique index says so; this stops
			// it being an error the reporter has to see.
			.onConflictDoNothing();

		const column = target.postId ? contentReports.postId : contentReports.commentId;
		const id = target.postId ?? target.commentId!;

		const [{ count }] = await tx
			.select({ count: sql<number>`count(*)::int` })
			.from(contentReports)
			.where(eq(column, id));

		if (count < REPORTS_TO_HIDE) return { hidden: false };

		if (target.postId) {
			await tx
				.update(posts)
				.set({ hiddenAt: sql`now()` })
				.where(and(eq(posts.id, target.postId), isNull(posts.hiddenAt)));
		} else {
			await tx
				.update(postComments)
				.set({ hiddenAt: sql`now()` })
				.where(and(eq(postComments.id, id), isNull(postComments.hiddenAt)));
		}

		return { hidden: true };
	});
}

/* -- Following ----------------------------------------------------------- */

export async function follow(
	followerUserId: string,
	target: { userId?: string; companyId?: string }
): Promise<void> {
	if (!target.userId === !target.companyId) error(400, 'Follow one thing at a time.');
	if (target.userId === followerUserId) error(400, 'You already know what you think.');

	await db
		.insert(follows)
		.values({
			followerUserId,
			followingUserId: target.userId ?? null,
			followingCompanyId: target.companyId ?? null
		})
		.onConflictDoNothing();
}

export async function unfollow(
	followerUserId: string,
	target: { userId?: string; companyId?: string }
): Promise<void> {
	await db
		.delete(follows)
		.where(
			and(
				eq(follows.followerUserId, followerUserId),
				target.userId
					? eq(follows.followingUserId, target.userId)
					: eq(follows.followingCompanyId, target.companyId!)
			)
		);
}

export async function isFollowing(
	followerUserId: string,
	target: { userId?: string; companyId?: string }
): Promise<boolean> {
	const [row] = await db
		.select({ id: follows.id })
		.from(follows)
		.where(
			and(
				eq(follows.followerUserId, followerUserId),
				target.userId
					? eq(follows.followingUserId, target.userId)
					: eq(follows.followingCompanyId, target.companyId!)
			)
		)
		.limit(1);

	return Boolean(row);
}

/** How many follow a company, for its page. */
export async function followerCount(companyId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(follows)
		.where(eq(follows.followingCompanyId, companyId));

	return row?.count ?? 0;
}
