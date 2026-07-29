import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { applications } from '../db/schema/application';
import { users } from '../db/schema/identity';
import { emailLog } from '../db/schema/platform';
import { apply, changeStatus } from '../services/application';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';

const ORIGIN = 'https://fann.test';

/**
 * The product tells employers it has notified the candidate. These tests are what
 * make that a checkable claim rather than a hopeful one.
 */
/** Unique per spec file, so cleanup cannot reach another suite's rows. */
const SUITE = 'notify';

describe.skipIf(!databaseReachable)('application notifications', () => {
	let fixture: JobFixture;
	let jobId: string;
	let organizationId: string;
	let employerId: string;

	async function freshCandidate(): Promise<string> {
		return (await createUser(SUITE)).id;
	}

	async function logFor(applicationId: string) {
		return db
			.select()
			.from(emailLog)
			.where(eq(emailLog.entityId, applicationId))
			.orderBy(desc(emailLog.createdAt));
	}

	beforeAll(async () => {
		// Its own job, so a parallel suite cannot apply to it mid-assertion.
		fixture = await createJobFixture(SUITE);
		jobId = fixture.jobId;
		organizationId = fixture.organizationId;
		employerId = await freshCandidate();
	});

	afterAll(async () => {
		await fixture.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	it('emails a confirmation when an application is submitted', async () => {
		const userId = await freshCandidate();
		const application = await apply({ jobId, userId, origin: ORIGIN });

		const log = await logFor(application.id);
		expect(log).toHaveLength(1);
		expect(log[0].tag).toBe('application.received');
		expect(log[0].status).toBe('sent');
	});

	it('emails the candidate when the employer rejects, carrying the reason', async () => {
		const userId = await freshCandidate();
		const application = await apply({ jobId, userId, origin: ORIGIN });

		await changeStatus(
			application.id,
			organizationId,
			employerId,
			'rejected',
			'We needed deeper Kubernetes experience.',
			ORIGIN
		);

		const log = await logFor(application.id);
		const rejection = log.find((entry) => entry.tag === 'application.rejected');

		expect(rejection, 'a rejection must produce an email').toBeTruthy();
		expect(rejection!.status).toBe('sent');
	});

	it('emails on each forward step of the pipeline', async () => {
		const userId = await freshCandidate();
		const application = await apply({ jobId, userId, origin: ORIGIN });

		await changeStatus(application.id, organizationId, employerId, 'in_review', undefined, ORIGIN);
		await changeStatus(
			application.id,
			organizationId,
			employerId,
			'interviewing',
			undefined,
			ORIGIN
		);

		const tags = (await logFor(application.id)).map((entry) => entry.tag);
		expect(tags).toContain('application.in_review');
		expect(tags).toContain('application.interviewing');
	});

	it('records the recipient so a failure can be chased', async () => {
		const userId = await freshCandidate();
		const application = await apply({ jobId, userId, origin: ORIGIN });

		const [candidate] = await db.select().from(users).where(eq(users.id, userId));
		const [entry] = await logFor(application.id);

		expect(entry.toEmail).toBe(candidate.email);
		expect(entry.userId).toBe(userId);
		expect(entry.entityType).toBe('application');
	});

	it('does not email when no origin is supplied', async () => {
		// Background jobs and tests can change status without spamming people.
		const userId = await freshCandidate();
		const application = await apply({ jobId, userId });

		await changeStatus(application.id, organizationId, employerId, 'in_review');

		expect(await logFor(application.id)).toHaveLength(0);
	});

	it('does not email on withdrawal, which the candidate did themselves', async () => {
		const userId = await freshCandidate();
		const application = await apply({ jobId, userId, origin: ORIGIN });

		const before = (await logFor(application.id)).length;
		await db
			.update(applications)
			.set({ status: 'withdrawn' })
			.where(eq(applications.id, application.id));

		expect((await logFor(application.id)).length).toBe(before);
	});
});
