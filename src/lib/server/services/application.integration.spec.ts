import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { applicationEvents, applications } from '../db/schema/application';
import { jobs } from '../db/schema/job';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import { apply, changeStatus, listForUser, timelineForCandidate, withdraw } from './application';

/** Unique per spec file, so cleanup cannot reach another suite's rows. */
const SUITE = 'lifecycle';

describe.skipIf(!databaseReachable)('application lifecycle', () => {
	let fixture: JobFixture;
	let jobId: string;
	let organizationId: string;
	let employerId: string;

	async function freshCandidate(): Promise<string> {
		return (await createUser(SUITE)).id;
	}

	beforeAll(async () => {
		// Its own job: the applicant-counter assertion below reads a number that a
		// parallel suite must not be able to move.
		fixture = await createJobFixture(SUITE);
		jobId = fixture.jobId;
		organizationId = fixture.organizationId;
		employerId = await freshCandidate();
	});

	afterAll(async () => {
		await fixture.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	it('records an application with a submitted event', async () => {
		const userId = await freshCandidate();
		const application = await apply({ jobId, userId, coverLetter: 'Hello.' });

		expect(application.status).toBe('submitted');
		// Nobody has responded yet — this is what the ghosting statistics measure.
		expect(application.firstRespondedAt).toBeNull();

		const events = await timelineForCandidate(application.id, userId);
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('submitted');
	});

	it('increments the job applicant counter in the same transaction', async () => {
		const [before] = await db
			.select({ count: jobs.applicantCount })
			.from(jobs)
			.where(eq(jobs.id, jobId));

		await apply({ jobId, userId: await freshCandidate() });

		const [after] = await db
			.select({ count: jobs.applicantCount })
			.from(jobs)
			.where(eq(jobs.id, jobId));
		expect(after.count).toBe(before.count + 1);
	});

	it('refuses a second application to the same job', async () => {
		const userId = await freshCandidate();
		await apply({ jobId, userId });

		await expect(apply({ jobId, userId })).rejects.toMatchObject({ status: 409 });
	});

	it('refuses an application to a job that is not published', async () => {
		await db.update(jobs).set({ status: 'paused' }).where(eq(jobs.id, jobId));
		try {
			await expect(apply({ jobId, userId: await freshCandidate() })).rejects.toMatchObject({
				status: 404
			});
		} finally {
			// Restore in `finally` so a failure here does not break every later test.
			await db.update(jobs).set({ status: 'published' }).where(eq(jobs.id, jobId));
		}
	});

	it('refuses an application to a job whose closing date has passed', async () => {
		await db
			.update(jobs)
			.set({ closesAt: new Date(Date.now() - 1000) })
			.where(eq(jobs.id, jobId));
		try {
			await expect(apply({ jobId, userId: await freshCandidate() })).rejects.toMatchObject({
				status: 404
			});
		} finally {
			await db.update(jobs).set({ closesAt: null }).where(eq(jobs.id, jobId));
		}
	});

	it('stamps the response clock the first time the employer engages', async () => {
		const userId = await freshCandidate();
		const application = await apply({ jobId, userId });

		const reviewed = await changeStatus(application.id, organizationId, employerId, 'in_review');
		expect(reviewed.firstRespondedAt).toBeInstanceOf(Date);
	});

	it('never resets the response clock on later changes', async () => {
		const userId = await freshCandidate();
		const application = await apply({ jobId, userId });

		const first = await changeStatus(application.id, organizationId, employerId, 'in_review');
		await new Promise((resolve) => setTimeout(resolve, 10));
		const later = await changeStatus(application.id, organizationId, employerId, 'interviewing');

		// A company that replies fast then goes quiet must not be able to re-earn a
		// good response time by touching the record again.
		expect(later.firstRespondedAt?.getTime()).toBe(first.firstRespondedAt?.getTime());
	});

	it('refuses an illegal employer transition', async () => {
		const userId = await freshCandidate();
		const application = await apply({ jobId, userId });

		// submitted → hired skips the entire process.
		await expect(
			changeStatus(application.id, organizationId, employerId, 'hired')
		).rejects.toMatchObject({ status: 400 });
	});

	it('refuses to act on an application belonging to another organization', async () => {
		const userId = await freshCandidate();
		const application = await apply({ jobId, userId });

		await expect(
			changeStatus(application.id, crypto.randomUUID(), employerId, 'in_review')
		).rejects.toMatchObject({ status: 404 });
	});

	it('lets a candidate withdraw and records it', async () => {
		const userId = await freshCandidate();
		const application = await apply({ jobId, userId });

		await withdraw(application.id, userId);

		const [row] = await db.select().from(applications).where(eq(applications.id, application.id));
		expect(row.status).toBe('withdrawn');
		expect(row.withdrawnAt).toBeInstanceOf(Date);

		const events = await timelineForCandidate(application.id, userId);
		expect(events.map((event) => event.type)).toEqual(['submitted', 'withdrawn']);
	});

	it('refuses a withdrawal by someone else', async () => {
		const userId = await freshCandidate();
		const application = await apply({ jobId, userId });

		await expect(withdraw(application.id, await freshCandidate())).rejects.toMatchObject({
			status: 404
		});
	});

	it('will not let the employer revive a withdrawn application', async () => {
		const userId = await freshCandidate();
		const application = await apply({ jobId, userId });
		await withdraw(application.id, userId);

		await expect(
			changeStatus(application.id, organizationId, employerId, 'in_review')
		).rejects.toMatchObject({ status: 400 });
	});

	it('hides internal events from the candidate timeline', async () => {
		const userId = await freshCandidate();
		const application = await apply({ jobId, userId });

		await db.insert(applicationEvents).values({
			applicationId: application.id,
			type: 'note_added',
			actorUserId: employerId,
			visibleToCandidate: false,
			payload: { note: 'Not a strong fit, but keep warm.' }
		});

		const events = await timelineForCandidate(application.id, userId);
		expect(events.map((event) => event.type)).not.toContain('note_added');
	});

	it('refuses to show a timeline to anyone but the applicant', async () => {
		const userId = await freshCandidate();
		const application = await apply({ jobId, userId });

		await expect(
			timelineForCandidate(application.id, await freshCandidate())
		).rejects.toMatchObject({ status: 404 });
	});

	it('lists a candidate’s applications with the job and company attached', async () => {
		const userId = await freshCandidate();
		await apply({ jobId, userId });

		const list = await listForUser(userId);
		expect(list).toHaveLength(1);
		expect(list[0].jobTitle).toBeTruthy();
		expect(list[0].companyName).toBeTruthy();
	});
});
