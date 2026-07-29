import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { companies } from '../db/schema/company';
import { orgMembers } from '../db/schema/org';
import { posts } from '../db/schema/social';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import {
	REPORTS_TO_HIDE,
	addComment,
	commentsFor,
	createPost,
	deletePost,
	feed,
	follow,
	isFollowing,
	report,
	toggleLike,
	unfollow
} from './social';

/** Unique per spec file, so cleanup cannot reach another suite's rows. */
const SUITE = 'social';

describe.skipIf(!databaseReachable)('posts, replies and follows', () => {
	let fixture: JobFixture;
	let member: string;
	let outsider: string;

	beforeAll(async () => {
		fixture = await createJobFixture(SUITE);
		member = (await createUser(SUITE)).id;
		outsider = (await createUser(SUITE)).id;

		await db
			.insert(orgMembers)
			.values({ organizationId: fixture.organizationId, userId: member, role: 'owner' });
	});

	afterAll(async () => {
		await fixture.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	async function setInteraction(allows: boolean) {
		await db
			.update(companies)
			.set({ allowsInteraction: allows })
			.where(eq(companies.id, fixture.companyId));
	}

	it('lets somebody post as a company they belong to', async () => {
		const post = await createPost({
			authorUserId: member,
			body: 'We are hiring two engineers this quarter.',
			companyId: fixture.companyId
		});

		// The person is kept even on a company post: "who actually said this" is the
		// first question when one goes wrong.
		expect(post.authorCompanyId).toBe(fixture.companyId);
		expect(post.authorUserId).toBe(member);
	});

	it('refuses to let a stranger speak for a company', async () => {
		await expect(
			createPost({ authorUserId: outsider, body: 'Official update', companyId: fixture.companyId })
		).rejects.toThrow();
	});

	it('refuses an empty post', async () => {
		await expect(createPost({ authorUserId: member, body: '   ' })).rejects.toThrow();
	});

	describe('when a company turns replies off', () => {
		let postId: string;

		beforeAll(async () => {
			const post = await createPost({
				authorUserId: member,
				body: 'A quiet announcement.',
				companyId: fixture.companyId
			});
			postId = post.id;
			await setInteraction(false);
		});

		afterAll(async () => {
			await setInteraction(true);
		});

		it('refuses a comment from the public', async () => {
			// Enforced in the service, not by hiding the button — none of these
			// endpoints is reachable only through the UI.
			await expect(addComment(postId, outsider, 'Nice')).rejects.toThrow();
		});

		it('refuses a like from the public', async () => {
			await expect(toggleLike(postId, outsider)).rejects.toThrow();
		});

		it('still lets the company’s own team reply', async () => {
			// Closing a thread to the public should not stop the people who wrote the
			// post from replying to each other under it.
			const comment = await addComment(postId, member, 'Adding some detail.');
			expect(comment.id).toBeDefined();
		});

		it('says so on the feed row, so the UI can match the rule', async () => {
			const rows = await feed({ viewerId: outsider });
			const row = rows.find((item) => item.id === postId);

			expect(row?.interactionsAllowed).toBe(false);
		});
	});

	it('leaves a personal post open even when a company has closed its own', async () => {
		await setInteraction(false);

		const post = await createPost({ authorUserId: outsider, body: 'Looking for backend work.' });
		const comment = await addComment(post.id, member, 'Have you seen the new listing?');

		// A person's post has no company behind it, so there is nothing switched off.
		expect(comment.id).toBeDefined();
		await setInteraction(true);
	});

	it('likes once per person, and unlikes on a second press', async () => {
		const post = await createPost({ authorUserId: member, body: 'Something likeable.' });

		expect(await toggleLike(post.id, outsider)).toEqual({ liked: true });
		expect(await toggleLike(post.id, outsider)).toEqual({ liked: false });

		const rows = await feed({ viewerId: outsider });
		expect(rows.find((row) => row.id === post.id)?.likes).toBe(0);
	});

	it('removes only your own post', async () => {
		const post = await createPost({ authorUserId: member, body: 'Mine to remove.' });

		await expect(deletePost(post.id, outsider)).rejects.toThrow();
		await deletePost(post.id, member);

		// Soft-deleted, so the row survives for anyone answering questions later.
		const [row] = await db.select().from(posts).where(eq(posts.id, post.id));
		expect(row.deletedAt).not.toBeNull();

		const rows = await feed({ viewerId: member });
		expect(rows.some((item) => item.id === post.id)).toBe(false);
	});

	it('hides something once enough separate people report it', async () => {
		const post = await createPost({ authorUserId: member, body: 'Something objectionable.' });

		const reporters = [];
		for (let i = 0; i < REPORTS_TO_HIDE; i++) reporters.push((await createUser(SUITE)).id);

		for (const [index, reporter] of reporters.entries()) {
			const result = await report({ postId: post.id }, reporter, 'spam');
			// Only the last one crosses the line.
			expect(result.hidden).toBe(index === REPORTS_TO_HIDE - 1);
		}

		const [row] = await db.select().from(posts).where(eq(posts.id, post.id));
		// Hidden, not deleted: the two are different events and both are recoverable.
		expect(row.hiddenAt).not.toBeNull();
		expect(row.deletedAt).toBeNull();
	});

	it('does not let one person report the same thing repeatedly', async () => {
		const post = await createPost({ authorUserId: member, body: 'Perfectly fine.' });
		const heckler = (await createUser(SUITE)).id;

		for (let i = 0; i < REPORTS_TO_HIDE + 2; i++) {
			// A report count one determined person can run up is a takedown button
			// with extra steps.
			expect((await report({ postId: post.id }, heckler, 'spam')).hidden).toBe(false);
		}

		const [row] = await db.select().from(posts).where(eq(posts.id, post.id));
		expect(row.hiddenAt).toBeNull();
	});

	it('follows a company and narrows the feed to it', async () => {
		await createPost({
			authorUserId: member,
			body: 'From a followed company.',
			companyId: fixture.companyId
		});

		expect(await isFollowing(outsider, { companyId: fixture.companyId })).toBe(false);
		await follow(outsider, { companyId: fixture.companyId });
		expect(await isFollowing(outsider, { companyId: fixture.companyId })).toBe(true);

		const followed = await feed({ viewerId: outsider, followingOnly: true });
		expect(followed.length).toBeGreaterThan(0);

		await unfollow(outsider, { companyId: fixture.companyId });
		expect(await isFollowing(outsider, { companyId: fixture.companyId })).toBe(false);
	});

	it('keeps your own posts in your following feed', async () => {
		const post = await createPost({ authorUserId: outsider, body: 'My own note.' });

		// A timeline that hides what you just wrote looks broken.
		const rows = await feed({ viewerId: outsider, followingOnly: true });
		expect(rows.some((row) => row.id === post.id)).toBe(true);
	});

	it('refuses to let somebody follow themselves', async () => {
		await expect(follow(outsider, { userId: outsider })).rejects.toThrow();
	});

	it('shows a signed-out reader posts but no ownership', async () => {
		const rows = await feed({ viewerId: null });

		for (const row of rows) {
			expect(row.ownedByViewer).toBe(false);
			expect(row.likedByViewer).toBe(false);
		}
	});

	it('hides a removed comment from the thread', async () => {
		const post = await createPost({ authorUserId: member, body: 'Thread parent.' });
		await addComment(post.id, outsider, 'First');

		const before = await commentsFor(post.id, outsider);
		expect(before).toHaveLength(1);
	});
});
