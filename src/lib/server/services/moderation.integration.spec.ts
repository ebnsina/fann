import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { users } from '../db/schema/identity';
import { orgMembers } from '../db/schema/org';
import { contentReports, postComments } from '../db/schema/social';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import { addComment, createPost, feed, report } from './social';
import { canModerate, dismiss, queue, setCommentHidden, setPostHidden } from './moderation';

/** Unique per spec file, so cleanup cannot reach another suite's rows. */
const SUITE = 'moderation';

describe.skipIf(!databaseReachable)('acting on reports', () => {
	let fixture: JobFixture;
	let other: JobFixture;
	let member: string;
	let rival: string;
	let outsider: string;
	let staff: string;

	beforeAll(async () => {
		fixture = await createJobFixture(SUITE);
		other = await createJobFixture(`${SUITE}-rival`);

		member = (await createUser(SUITE)).id;
		rival = (await createUser(SUITE)).id;
		outsider = (await createUser(SUITE)).id;
		staff = (await createUser(SUITE)).id;

		await db.insert(orgMembers).values([
			{ organizationId: fixture.organizationId, userId: member, role: 'owner' },
			{ organizationId: other.organizationId, userId: rival, role: 'owner' }
		]);

		// Set by hand, exactly as the column's comment says it must be — there is
		// deliberately no way to grant this from the product.
		await db.update(users).set({ platformAdmin: true }).where(eq(users.id, staff));
	});

	afterAll(async () => {
		await fixture.cleanup();
		await other.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	/** A company post with one reply on it. */
	async function threadOnCompanyPost() {
		const post = await createPost({
			authorUserId: member,
			body: 'A company update.',
			companyId: fixture.companyId
		});
		const comment = await addComment(post.id, outsider, 'A reply somebody objects to.');
		return { postId: post.id, commentId: comment.id };
	}

	it('lets the company hide a reply under its own post', async () => {
		const { postId, commentId } = await threadOnCompanyPost();

		expect(await canModerate(postId, member)).toBe(true);
		await setCommentHidden(commentId, member, true);

		// Hidden, not deleted: the row stays, so this can be undone and can be shown
		// to have been wrong.
		const [row] = await db.select().from(postComments).where(eq(postComments.id, commentId));
		expect(row.hiddenAt).not.toBeNull();
		expect(row.deletedAt).toBeNull();
	});

	it('refuses a different company', async () => {
		const { postId, commentId } = await threadOnCompanyPost();

		// The whole point of scoping it. A company runs its own threads and nobody
		// else's.
		expect(await canModerate(postId, rival)).toBe(false);
		await expect(setCommentHidden(commentId, rival, true)).rejects.toThrow();
	});

	it('refuses a passer-by', async () => {
		const { commentId } = await threadOnCompanyPost();
		await expect(setCommentHidden(commentId, outsider, true)).rejects.toThrow();
	});

	it('gives nobody authority over a person’s post', async () => {
		const post = await createPost({ authorUserId: outsider, body: 'A personal post.' });
		const comment = await addComment(post.id, member, 'A reply.');

		// No company behind it, so there is no company authority — only staff.
		expect(await canModerate(post.id, member)).toBe(false);
		await expect(setCommentHidden(comment.id, member, true)).rejects.toThrow();

		expect(await canModerate(post.id, staff)).toBe(true);
	});

	it('closes the open reports when somebody acts', async () => {
		const { postId, commentId } = await threadOnCompanyPost();
		await report({ commentId }, outsider, 'spam');

		await setCommentHidden(commentId, member, true);

		// Closed rather than deleted, so "we looked" is answerable later.
		const rows = await db
			.select()
			.from(contentReports)
			.where(eq(contentReports.commentId, commentId));

		expect(rows.every((row) => row.reviewedAt !== null)).toBe(true);
		expect(postId).toBeDefined();
	});

	it('shows staff the queue and hides it from everyone else', async () => {
		const post = await createPost({ authorUserId: outsider, body: 'Reported thing.' });
		await report({ postId: post.id }, member, 'off topic');

		// Denied as not-found, so probing does not confirm a queue exists.
		await expect(queue(outsider)).rejects.toThrow();

		const open = await queue(staff);
		expect(open.some((item) => item.id === post.id)).toBe(true);
	});

	it('restores something the threshold hid when staff disagree', async () => {
		const post = await createPost({ authorUserId: outsider, body: 'Wrongly reported.' });

		// Enough separate people to trip the auto-hide.
		for (let i = 0; i < 3; i++) {
			await report({ postId: post.id }, (await createUser(SUITE)).id, 'spam');
		}

		let rows = await feed({ viewerId: null });
		expect(rows.some((row) => row.id === post.id)).toBe(false);

		await dismiss({ postId: post.id }, staff);

		// An auto-hide a human has looked at and disagreed with must actually come
		// back, or the threshold becomes a permanent takedown nobody chose.
		rows = await feed({ viewerId: null });
		expect(rows.some((row) => row.id === post.id)).toBe(true);
	});

	it('lets staff take down a post anywhere', async () => {
		const post = await createPost({ authorUserId: outsider, body: 'Something for staff.' });

		await setPostHidden(post.id, staff, true);

		const rows = await feed({ viewerId: null });
		expect(rows.some((row) => row.id === post.id)).toBe(false);
	});

	it('hides a hidden reply from the thread everyone else reads', async () => {
		const { postId, commentId } = await threadOnCompanyPost();

		const { commentsFor } = await import('./social');
		expect(await commentsFor(postId, outsider)).toHaveLength(1);

		await setCommentHidden(commentId, member, true);
		expect(await commentsFor(postId, outsider)).toHaveLength(0);
	});
});
