import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import { apply, timelineForCandidate } from './application';
import { attach, detach, listForApplication, listForOrg, remove } from './tag';

/** Unique per spec file, so cleanup cannot reach another suite's rows. */
const SUITE = 'tag';

describe.skipIf(!databaseReachable)('tags', () => {
	let fixture: JobFixture;
	let organizationId: string;

	beforeAll(async () => {
		fixture = await createJobFixture(SUITE);
		organizationId = fixture.organizationId;
	});

	afterAll(async () => {
		await fixture.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	async function freshApplication(): Promise<{ applicationId: string; candidateId: string }> {
		const candidateId = (await createUser(SUITE)).id;
		const application = await apply({ jobId: fixture.jobId, userId: candidateId });
		return { applicationId: application.id, candidateId };
	}

	it('treats spacing and padding as the same tag', async () => {
		const first = await freshApplication();
		const second = await freshApplication();

		const a = await attach(first.applicationId, organizationId, 'referred');
		const b = await attach(second.applicationId, organizationId, '  referred  ');
		const c = await attach(second.applicationId, organizationId, 'needs   visa');

		// Three near-identical labels is how a tag list stops being useful by week
		// three.
		expect(b.id).toBe(a.id);
		expect(c.name).toBe('needs visa');
	});

	it('is never shown to the candidate', async () => {
		const { applicationId, candidateId } = await freshApplication();
		await attach(applicationId, organizationId, 'reapply in a year');

		// A tag is the team's margin note. If it reached the candidate's timeline it
		// would be a decision, and decisions belong in events.
		const timeline = await timelineForCandidate(applicationId, candidateId);
		expect(JSON.stringify(timeline)).not.toContain('reapply');
	});

	it('does not duplicate a tag already on an application', async () => {
		const { applicationId } = await freshApplication();

		await attach(applicationId, organizationId, 'referred');
		await attach(applicationId, organizationId, 'referred');

		const tags = await listForApplication(applicationId, organizationId);
		expect(tags.filter((tag) => tag.name === 'referred')).toHaveLength(1);
	});

	it('detaches without deleting the tag itself', async () => {
		const first = await freshApplication();
		const second = await freshApplication();

		const tag = await attach(first.applicationId, organizationId, 'shared label');
		await attach(second.applicationId, organizationId, 'shared label');

		await detach(first.applicationId, organizationId, tag.id);

		expect(await listForApplication(first.applicationId, organizationId)).toHaveLength(0);
		// Still on the other application — removing a label from one person must not
		// remove it from everybody.
		expect(await listForApplication(second.applicationId, organizationId)).toHaveLength(1);
	});

	it('counts how many applications carry each tag', async () => {
		const first = await freshApplication();
		const second = await freshApplication();

		await attach(first.applicationId, organizationId, 'counted');
		await attach(second.applicationId, organizationId, 'counted');

		const all = await listForOrg(organizationId);
		expect(all.find((tag) => tag.name === 'counted')?.usageCount).toBe(2);
	});

	it('refuses an application belonging to another organization', async () => {
		const other = await createJobFixture(`${SUITE}-other`);
		const userId = (await createUser(SUITE)).id;
		const application = await apply({ jobId: other.jobId, userId });

		await expect(attach(application.id, organizationId, 'nope')).rejects.toThrow();

		await other.cleanup();
	});

	it('takes its applications with it when deleted', async () => {
		const { applicationId } = await freshApplication();
		const tag = await attach(applicationId, organizationId, 'temporary');

		await remove(tag.id, organizationId);

		expect(await listForApplication(applicationId, organizationId)).toHaveLength(0);
	});
});
