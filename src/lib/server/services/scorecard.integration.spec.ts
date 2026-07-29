import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import { apply } from './application';
import { ensureCriteria, panelFor, save, submittedCount } from './scorecard';

/** Unique per spec file, so cleanup cannot reach another suite's rows. */
const SUITE = 'scorecard';

describe.skipIf(!databaseReachable)('interview scorecards', () => {
	let fixture: JobFixture;
	let organizationId: string;
	let alice: string;
	let bob: string;
	let criterionId: string;

	beforeAll(async () => {
		fixture = await createJobFixture(SUITE);
		organizationId = fixture.organizationId;
		alice = (await createUser(SUITE)).id;
		bob = (await createUser(SUITE)).id;

		const criteria = await ensureCriteria(fixture.jobId);
		criterionId = criteria[0].id;
	});

	afterAll(async () => {
		await fixture.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	async function freshApplication(): Promise<string> {
		const userId = (await createUser(SUITE)).id;
		const application = await apply({ jobId: fixture.jobId, userId });
		return application.id;
	}

	it('gives a job criteria on first use', async () => {
		const criteria = await ensureCriteria(fixture.jobId);
		expect(criteria.length).toBeGreaterThan(0);
		expect(criteria.every((criterion) => criterion.name.length > 0)).toBe(true);
	});

	it('hides other scorecards until you submit your own', async () => {
		const applicationId = await freshApplication();

		await save({
			applicationId,
			organizationId,
			interviewerUserId: alice,
			overall: 4,
			summary: 'Strong hire.',
			submit: true
		});

		// This is the whole feature. Bob has not scored, so he must not be able to
		// read Alice's — a panel that sees the first opinion before forming the second
		// is one assessment and three agreements.
		const before = await panelFor(applicationId, organizationId, bob);
		expect(before.others).toHaveLength(0);
		expect(before.hiddenUntilYouSubmit).toBe(true);
		// The count is fine to show; the content is not.
		expect(before.othersSubmittedCount).toBe(1);
		expect(JSON.stringify(before)).not.toContain('Strong hire');

		await save({
			applicationId,
			organizationId,
			interviewerUserId: bob,
			overall: 2,
			summary: 'Not for this role.',
			submit: true
		});

		const after = await panelFor(applicationId, organizationId, bob);
		expect(after.others).toHaveLength(1);
		expect(after.others[0].summary).toBe('Strong hire.');
		expect(after.hiddenUntilYouSubmit).toBe(false);
	});

	it('does not leak other scorecards to someone holding only a draft', async () => {
		const applicationId = await freshApplication();
		await save({
			applicationId,
			organizationId,
			interviewerUserId: alice,
			overall: 3,
			submit: true
		});

		// A draft is not a submission. Starting to type must not buy you the room's
		// opinion.
		await save({ applicationId, organizationId, interviewerUserId: bob, summary: 'Thinking…' });

		const panel = await panelFor(applicationId, organizationId, bob);
		expect(panel.mine?.submittedAt).toBeNull();
		expect(panel.others).toHaveLength(0);
		expect(panel.hiddenUntilYouSubmit).toBe(true);
	});

	it('refuses to change a submitted scorecard', async () => {
		const applicationId = await freshApplication();
		await save({
			applicationId,
			organizationId,
			interviewerUserId: alice,
			overall: 3,
			submit: true
		});

		// Editing after reading the room is anchoring arriving a few minutes later.
		await expect(
			save({ applicationId, organizationId, interviewerUserId: alice, overall: 1 })
		).rejects.toThrow();
	});

	it('will not submit without an overall score', async () => {
		const applicationId = await freshApplication();

		// A blank scorecard marked complete is worse than none, because it reads as
		// an opinion.
		await expect(
			save({ applicationId, organizationId, interviewerUserId: alice, submit: true })
		).rejects.toThrow();
	});

	it('rejects a rating outside the scale', async () => {
		const applicationId = await freshApplication();

		await expect(
			save({
				applicationId,
				organizationId,
				interviewerUserId: alice,
				ratings: [{ criterionId, rating: 7 }]
			})
		).rejects.toThrow();

		await expect(
			save({ applicationId, organizationId, interviewerUserId: alice, overall: 9, submit: true })
		).rejects.toThrow();
	});

	it('rejects a criterion belonging to another job', async () => {
		const other = await createJobFixture(`${SUITE}-other`);
		const foreign = (await ensureCriteria(other.jobId))[0];
		const applicationId = await freshApplication();

		await expect(
			save({
				applicationId,
				organizationId,
				interviewerUserId: alice,
				ratings: [{ criterionId: foreign.id, rating: 3 }]
			})
		).rejects.toThrow();

		await other.cleanup();
	});

	it('keeps one scorecard per interviewer, updating the draft in place', async () => {
		const applicationId = await freshApplication();

		await save({ applicationId, organizationId, interviewerUserId: alice, summary: 'First pass.' });
		await save({
			applicationId,
			organizationId,
			interviewerUserId: alice,
			summary: 'Second pass.',
			ratings: [{ criterionId, rating: 3, comment: 'Solid.' }]
		});

		const panel = await panelFor(applicationId, organizationId, alice);
		expect(panel.mine?.summary).toBe('Second pass.');
		expect(panel.mine?.ratings).toHaveLength(1);
		expect(panel.mine?.ratings[0].rating).toBe(3);
	});

	it('refuses an application belonging to another organization', async () => {
		const other = await createJobFixture(`${SUITE}-foreign`);
		const userId = (await createUser(SUITE)).id;
		const application = await apply({ jobId: other.jobId, userId });

		await expect(panelFor(application.id, organizationId, alice)).rejects.toThrow();

		await other.cleanup();
	});

	it('counts only submitted scorecards', async () => {
		const applicationId = await freshApplication();

		await save({ applicationId, organizationId, interviewerUserId: alice, summary: 'Draft.' });
		expect(await submittedCount(applicationId)).toBe(0);

		await save({
			applicationId,
			organizationId,
			interviewerUserId: alice,
			overall: 4,
			submit: true
		});
		expect(await submittedCount(applicationId)).toBe(1);
	});
});
