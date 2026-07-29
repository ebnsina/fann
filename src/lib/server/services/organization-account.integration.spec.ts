import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { applicationEvents, applications } from '../db/schema/application';
import { offers } from '../db/schema/ats';
import { companies } from '../db/schema/company';
import { jobs } from '../db/schema/job';
import { orgMembers, organizations } from '../db/schema/org';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import { apply } from './application';
import { close, closureBlocker, closureImpact, exportFor } from './organization-account';

const SUITE = 'org-account';

describe.skipIf(!databaseReachable)('closing a company', () => {
	let fixture: JobFixture;
	let candidateId: string;

	beforeEach(async () => {
		fixture = await createJobFixture(SUITE);
		candidateId = (await createUser(SUITE)).id;

		await db
			.insert(orgMembers)
			.values({ organizationId: fixture.organizationId, userId: candidateId, role: 'owner' });
	});

	afterEach(async () => {
		await fixture.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	it('answers everyone still waiting instead of leaving them', async () => {
		const applicant = await createUser(SUITE);
		await apply({ jobId: fixture.jobId, userId: applicant.id });

		const result = await close(fixture.organizationId);

		expect(result.applicationsAnswered).toBe(1);

		const [row] = await db
			.select()
			.from(applications)
			.where(eq(applications.organizationId, fixture.organizationId));

		// A company vanishing mid-process is exactly the ghosting this product
		// argues with. They get a real answer, and it says what actually happened.
		expect(row.status).toBe('rejected');
		expect(row.rejectionReason).toMatch(/closed its Fann account/i);

		const events = await db
			.select()
			.from(applicationEvents)
			.where(
				and(
					eq(applicationEvents.applicationId, row.id),
					eq(applicationEvents.visibleToCandidate, true)
				)
			);

		expect(events.some((event) => event.type === 'status_changed')).toBe(true);
	});

	it('never stamps the response clock, so closing cannot buy a good record', async () => {
		const applicant = await createUser(SUITE);
		await apply({ jobId: fixture.jobId, userId: applicant.id });

		await close(fixture.organizationId);

		const [row] = await db
			.select()
			.from(applications)
			.where(eq(applications.organizationId, fixture.organizationId));

		// The whole reason this does not route through `changeStatus`: that stamps
		// `firstRespondedAt` on any move to `rejected`, which would let a company
		// that ignored three hundred people close its account and come out with a
		// perfect response rate.
		expect(row.firstRespondedAt).toBeNull();
	});

	it('keeps the applications a candidate depends on', async () => {
		const applicant = await createUser(SUITE);
		const application = await apply({ jobId: fixture.jobId, userId: applicant.id });

		await close(fixture.organizationId);

		// `organizations → jobs → applications` cascades all the way, so a hard
		// delete here would erase somebody's record of their own job hunting.
		const [survivor] = await db
			.select()
			.from(applications)
			.where(eq(applications.id, application.id));
		expect(survivor).toBeDefined();

		const [job] = await db.select().from(jobs).where(eq(jobs.id, fixture.jobId));
		expect(job).toBeDefined();
		expect(job.deletedAt).not.toBeNull();
		expect(job.status).toBe('closed');
	});

	it('takes the listings and the public page down and removes every member', async () => {
		await close(fixture.organizationId);

		const [company] = await db
			.select()
			.from(companies)
			.where(eq(companies.organizationId, fixture.organizationId));
		expect(company.deletedAt).not.toBeNull();

		const [organization] = await db
			.select()
			.from(organizations)
			.where(eq(organizations.id, fixture.organizationId));
		expect(organization.deletedAt).not.toBeNull();
		// Otherwise a closed company keeps a badge nothing is re-checking.
		expect(organization.domainVerifiedAt).toBeNull();

		// The data is kept for the candidates' sake, not the company's — so nobody
		// is left able to reach it.
		const members = await db
			.select()
			.from(orgMembers)
			.where(eq(orgMembers.organizationId, fixture.organizationId));
		expect(members).toHaveLength(0);
	});

	it('refuses while somebody is still deciding on an offer', async () => {
		const applicant = await createUser(SUITE);
		const application = await apply({ jobId: fixture.jobId, userId: applicant.id });

		await db.insert(offers).values({
			applicationId: application.id,
			createdByUserId: candidateId,
			status: 'sent',
			salaryAmount: 120_000,
			salaryCurrency: 'USD',
			salaryPeriod: 'year'
		});

		const blocker = await closureBlocker(fixture.organizationId);
		expect(blocker).toMatch(/deciding on an offer/i);

		// Closing underneath them would leave somebody holding a job offer from a
		// company that no longer exists here, with no way to accept it.
		await expect(close(fixture.organizationId)).rejects.toThrow();

		const [row] = await db.select().from(applications).where(eq(applications.id, application.id));
		expect(row.status).not.toBe('rejected');
	});

	it('counts what closing would affect, before it happens', async () => {
		const applicant = await createUser(SUITE);
		await apply({ jobId: fixture.jobId, userId: applicant.id });

		const impact = await closureImpact(fixture.organizationId);

		expect(impact.openJobs).toBe(1);
		expect(impact.waitingCandidates).toBe(1);
		expect(impact.teamMembers).toBe(1);
	});

	it('exports the company’s own record, notes included', async () => {
		const applicant = await createUser(SUITE);
		await apply({ jobId: fixture.jobId, userId: applicant.id });

		const data = await exportFor(fixture.organizationId);

		expect(data.jobs).toHaveLength(1);
		expect(data.applications).toHaveLength(1);
		expect(data.applications[0].candidateEmail).toBe(applicant.email);
		// Internal notes are the company's own record — absent from the candidate
		// export for exactly the reason they belong in this one.
		expect(data.applications[0]).toHaveProperty('notes');
		expect(data.team).toHaveLength(1);
	});
});
