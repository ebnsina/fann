import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { companies } from '../db/schema/company';
import { users } from '../db/schema/identity';
import { orgMembers } from '../db/schema/org';
import { contentReports, postComments, posts } from '../db/schema/social';

/**
 * Acting on what gets reported.
 *
 * `social.ts` hides something once enough separate people flag it. That is a
 * stopgap and behaves like one: it cannot unhide a false positive, and it never
 * fires for a report that stops at two. This is the part that reads the queue.
 *
 * Authority comes from one of two places and never from anywhere else:
 *
 *   - **The company whose post a reply sits under.** They are the party who
 *     actually cares what appears beneath their name, and scoping it to their own
 *     threads means the common case needs no platform staff at all.
 *   - **Platform staff**, for everything else — a reply under a person's post, or
 *     a company's own post.
 *
 * Both are computed here from the row being acted on. A caller never says which
 * authority it is using, because a caller that could would eventually claim the
 * wrong one.
 */

export type Authority = 'company' | 'platform' | 'none';

/** Whether this person is platform staff. Read once per action, never cached. */
async function isPlatformAdmin(userId: string): Promise<boolean> {
	const [row] = await db
		.select({ platformAdmin: users.platformAdmin })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	return Boolean(row?.platformAdmin);
}

/**
 * What authority somebody has over one post.
 *
 * A company may act on replies under its own posts, and on its own posts. It has
 * no authority over a person's post or another company's, which is the whole
 * point of scoping it.
 */
async function authorityOverPost(postId: string, userId: string): Promise<Authority> {
	if (await isPlatformAdmin(userId)) return 'platform';

	const [row] = await db
		.select({ id: posts.id })
		.from(posts)
		.innerJoin(companies, eq(companies.id, posts.authorCompanyId))
		.innerJoin(orgMembers, eq(orgMembers.organizationId, companies.organizationId))
		.where(and(eq(posts.id, postId), eq(orgMembers.userId, userId)))
		.limit(1);

	return row ? 'company' : 'none';
}

/**
 * Hide or restore a reply.
 *
 * Hiding is not deleting: the row stays, the author is unchanged, and this can be
 * undone. A moderation action that destroys its subject cannot be appealed and
 * cannot be shown to have been wrong.
 */
export async function setCommentHidden(
	commentId: string,
	userId: string,
	hidden: boolean
): Promise<void> {
	const [comment] = await db
		.select({ postId: postComments.postId })
		.from(postComments)
		.where(eq(postComments.id, commentId))
		.limit(1);

	// Not-found rather than forbidden: confirming a comment id exists tells the
	// asker something about a thread they may not be able to see.
	if (!comment) error(404, 'Not found.');

	const authority = await authorityOverPost(comment.postId, userId);
	if (authority === 'none') error(404, 'Not found.');

	await db
		.update(postComments)
		.set({ hiddenAt: hidden ? new Date() : null })
		.where(eq(postComments.id, commentId));

	await closeReports({ commentId });
}

/** Hide or restore a post. Platform staff, or the company that published it. */
export async function setPostHidden(
	postId: string,
	userId: string,
	hidden: boolean
): Promise<void> {
	const authority = await authorityOverPost(postId, userId);
	if (authority === 'none') error(404, 'Not found.');

	await db
		.update(posts)
		.set({ hiddenAt: hidden ? new Date() : null })
		.where(eq(posts.id, postId));

	await closeReports({ postId });
}

/**
 * Mark every report against something as dealt with.
 *
 * Closed rather than deleted, and closed whichever way the decision went — "we
 * looked and left it up" is an outcome somebody may need to point at later, and a
 * queue that only remembers takedowns reads as a record of censorship.
 */
async function closeReports(target: { postId?: string; commentId?: string }): Promise<void> {
	const column = target.postId ? contentReports.postId : contentReports.commentId;
	const id = target.postId ?? target.commentId!;

	await db
		.update(contentReports)
		.set({ reviewedAt: new Date() })
		.where(and(eq(column, id), isNull(contentReports.reviewedAt)));
}

export interface QueueItem {
	kind: 'post' | 'comment';
	id: string;
	body: string;
	authorName: string;
	companyName: string | null;
	createdAt: Date;
	hidden: boolean;
	reports: number;
	reasons: string[];
}

/**
 * Everything waiting on a decision, most-reported first.
 *
 * Platform staff only. A company sees reports on its own threads inline, where
 * the reply is — a separate queue for two comments a week is a page nobody opens.
 */
export async function queue(userId: string, limit = 50): Promise<QueueItem[]> {
	if (!(await isPlatformAdmin(userId))) error(404, 'Not found.');

	const postRows = await db
		.select({
			id: posts.id,
			body: posts.body,
			createdAt: posts.createdAt,
			hidden: sql<boolean>`${posts.hiddenAt} is not null`,
			authorName: users.name,
			companyName: companies.name,
			reports: sql<number>`count(${contentReports.id})::int`,
			reasons: sql<string[]>`array_agg(${contentReports.reason})`
		})
		.from(contentReports)
		.innerJoin(posts, eq(posts.id, contentReports.postId))
		.innerJoin(users, eq(users.id, posts.authorUserId))
		.leftJoin(companies, eq(companies.id, posts.authorCompanyId))
		.where(isNull(contentReports.reviewedAt))
		.groupBy(posts.id, users.name, companies.name)
		.orderBy(desc(sql`count(${contentReports.id})`))
		.limit(limit);

	const commentRows = await db
		.select({
			id: postComments.id,
			body: postComments.body,
			createdAt: postComments.createdAt,
			hidden: sql<boolean>`${postComments.hiddenAt} is not null`,
			authorName: users.name,
			reports: sql<number>`count(${contentReports.id})::int`,
			reasons: sql<string[]>`array_agg(${contentReports.reason})`
		})
		.from(contentReports)
		.innerJoin(postComments, eq(postComments.id, contentReports.commentId))
		.innerJoin(users, eq(users.id, postComments.authorUserId))
		.where(isNull(contentReports.reviewedAt))
		.groupBy(postComments.id, users.name)
		.orderBy(desc(sql`count(${contentReports.id})`))
		.limit(limit);

	return [
		...postRows.map((row) => ({ ...row, kind: 'post' as const })),
		...commentRows.map((row) => ({ ...row, kind: 'comment' as const, companyName: null }))
	].sort((a, b) => b.reports - a.reports);
}

/** Leave it up, and record that somebody decided that. */
export async function dismiss(
	target: { postId?: string; commentId?: string },
	userId: string
): Promise<void> {
	if (!(await isPlatformAdmin(userId))) error(404, 'Not found.');

	// Dismissing also un-hides: an auto-hide that a human has now looked at and
	// disagreed with must actually come back, or the threshold becomes permanent.
	if (target.postId)
		await db.update(posts).set({ hiddenAt: null }).where(eq(posts.id, target.postId));
	else
		await db
			.update(postComments)
			.set({ hiddenAt: null })
			.where(eq(postComments.id, target.commentId!));

	await closeReports(target);
}

/** Reports on this company's own threads, shown inline rather than in a queue. */
export async function reportedInThread(postId: string, userId: string): Promise<Set<string>> {
	const authority = await authorityOverPost(postId, userId);
	if (authority === 'none') return new Set();

	const rows = await db
		.select({ commentId: contentReports.commentId })
		.from(contentReports)
		.innerJoin(postComments, eq(postComments.id, contentReports.commentId))
		.where(and(eq(postComments.postId, postId), isNull(contentReports.reviewedAt)));

	return new Set(rows.map((row) => row.commentId!).filter(Boolean));
}

/** Whether the viewer can moderate this thread, for drawing the controls. */
export async function canModerate(postId: string, userId: string): Promise<boolean> {
	return (await authorityOverPost(postId, userId)) !== 'none';
}
