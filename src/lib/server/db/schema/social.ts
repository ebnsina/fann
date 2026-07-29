import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { baseColumns, baseSoftDeleteColumns } from './_shared';
import { companies } from './company';
import { users } from './identity';

/**
 * Posts, comments, likes and follows.
 *
 * This reverses an earlier decision, and the reversal is worth stating rather
 * than quietly overwriting: company pages deliberately carried no free text from
 * third parties, because moderating that is a full-time job and the measured
 * figures said more anyway. Those figures are unchanged and still the thing a
 * candidate should read first. This sits beside them.
 *
 * Two consequences follow from letting people post under their own names, and
 * both are handled here rather than left to the UI:
 *
 *   - **Posting is public and separate from profile visibility.** A candidate
 *     whose profile is `private` can still post, and posting does not change
 *     that. The two settings answer different questions — "can companies find me
 *     in a search" and "did I choose to say this out loud" — and collapsing them
 *     would either silence people or expose them.
 *   - **Everything is soft-deleted and attributable.** A comment thread where
 *     posts vanish without trace is one nobody can moderate or appeal.
 */

/**
 * A post.
 *
 * `authorCompanyId` is what makes it a company's post rather than a person's.
 * The user id is kept either way — a company post is still written by somebody,
 * and "who actually said this" is the first question when a post goes wrong.
 */
export const posts = pgTable(
	'posts',
	{
		...baseSoftDeleteColumns,
		authorUserId: uuid('author_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** Set when posting on behalf of a company the author belongs to. */
		authorCompanyId: uuid('author_company_id').references(() => companies.id, {
			onDelete: 'cascade'
		}),
		/** Markdown, rendered through the same sanitizer as every other user text. */
		body: text('body').notNull(),
		/**
		 * Hidden by moderation rather than by its author.
		 *
		 * Separate from `deletedAt` on purpose: an author removing their own post and
		 * a post being taken down are different events, and a single flag makes it
		 * impossible to tell which happened or to put one of them back.
		 */
		hiddenAt: timestamp('hidden_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		index('posts_author_idx').on(table.authorUserId, table.createdAt),
		index('posts_company_idx').on(table.authorCompanyId, table.createdAt),
		// The feed reads newest-first across a set of authors.
		index('posts_recent_idx').on(table.createdAt)
	]
);

export const postComments = pgTable(
	'post_comments',
	{
		...baseSoftDeleteColumns,
		postId: uuid('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		authorUserId: uuid('author_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		body: text('body').notNull(),
		hiddenAt: timestamp('hidden_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [index('post_comments_post_idx').on(table.postId, table.createdAt)]
);

/** One per person per post — the unique index is the whole rule. */
export const postLikes = pgTable(
	'post_likes',
	{
		...baseColumns,
		postId: uuid('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' })
	},
	(table) => [
		uniqueIndex('post_likes_key').on(table.postId, table.userId),
		index('post_likes_user_idx').on(table.userId)
	]
);

/**
 * Following a company or a person.
 *
 * One table with two nullable targets rather than two tables: every read is "the
 * things this person follows", and splitting that across two tables makes the
 * feed a union query for no benefit. Exactly one target is set, enforced by the
 * service and by a check constraint added in the migration.
 */
export const follows = pgTable(
	'follows',
	{
		...baseColumns,
		followerUserId: uuid('follower_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		followingUserId: uuid('following_user_id').references(() => users.id, { onDelete: 'cascade' }),
		followingCompanyId: uuid('following_company_id').references(() => companies.id, {
			onDelete: 'cascade'
		})
	},
	(table) => [
		// Nulls count as distinct in Postgres, so these are two partial indexes
		// rather than one over both columns — otherwise the same follow could be
		// inserted repeatedly.
		uniqueIndex('follows_user_key')
			.on(table.followerUserId, table.followingUserId)
			.where(sql`following_user_id is not null`),
		uniqueIndex('follows_company_key')
			.on(table.followerUserId, table.followingCompanyId)
			.where(sql`following_company_id is not null`),
		index('follows_following_user_idx').on(table.followingUserId),
		index('follows_following_company_idx').on(table.followingCompanyId)
	]
);

/**
 * Somebody flagging a post or a comment.
 *
 * Kept even after the thing is hidden or deleted. A moderation record that
 * disappears with its subject cannot answer "why was this taken down" later,
 * which is the only question anybody asks about moderation.
 */
export const contentReports = pgTable(
	'content_reports',
	{
		...baseColumns,
		reporterUserId: uuid('reporter_user_id').references(() => users.id, { onDelete: 'set null' }),
		postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
		commentId: uuid('comment_id').references(() => postComments.id, { onDelete: 'cascade' }),
		reason: text('reason').notNull(),
		reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		// One report per person per thing. Otherwise one determined person can hide
		// anything by reporting it repeatedly.
		uniqueIndex('content_reports_post_key')
			.on(table.reporterUserId, table.postId)
			.where(sql`post_id is not null`),
		uniqueIndex('content_reports_comment_key')
			.on(table.reporterUserId, table.commentId)
			.where(sql`comment_id is not null`),
		index('content_reports_open_idx').on(table.reviewedAt)
	]
);

export type Post = typeof posts.$inferSelect;
export type PostComment = typeof postComments.$inferSelect;
