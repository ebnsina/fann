import { eq, like } from 'drizzle-orm';
import { db } from '../db';
import { companies } from '../db/schema/company';
import { users } from '../db/schema/identity';
import { jobs } from '../db/schema/job';
import { organizations } from '../db/schema/org';

/**
 * Fixtures for integration tests. Not imported by application code.
 *
 * Vitest runs spec files in parallel, so two suites that both grab "the first
 * published job" will race on its `applicantCount` and on each other's
 * applications. Every suite creates its own organization and job instead.
 */

/** Marks everything this module creates, so cleanup is a single prefix match. */
export const FIXTURE_PREFIX = 'fixture-';

export interface JobFixture {
	organizationId: string;
	companyId: string;
	jobId: string;
	cleanup: () => Promise<void>;
}

/** A published job nobody else's test will touch. */
export async function createJobFixture(label: string): Promise<JobFixture> {
	const suffix = crypto.randomUUID();
	const slug = `${FIXTURE_PREFIX}${label}-${suffix}`;

	const [organization] = await db
		.insert(organizations)
		.values({ name: `Fixture ${label}`, slug })
		.returning();

	const [company] = await db
		.insert(companies)
		.values({ organizationId: organization.id, name: `Fixture ${label}`, slug })
		.returning();

	const [job] = await db
		.insert(jobs)
		.values({
			organizationId: organization.id,
			companyId: company.id,
			title: `Fixture Engineer ${label}`,
			slug: `${slug}-job`,
			description: 'A fixture job used by integration tests. '.repeat(6),
			salaryMin: 100_000,
			salaryMax: 150_000,
			status: 'published',
			publishedAt: new Date(),
			responseSlaDays: 5
		})
		.returning();

	return {
		organizationId: organization.id,
		companyId: company.id,
		jobId: job.id,
		// Cascades take the company, job, applications and events with it.
		cleanup: async () => {
			await db.delete(organizations).where(eq(organizations.id, organization.id));
		}
	};
}

/**
 * A user belonging to one suite.
 *
 * `label` must be unique per spec file and match the one passed to
 * `deleteFixtureUsers` — an unscoped cleanup deletes another suite's users while
 * it is still running, which is a slow, confusing kind of flake.
 */
export async function createUser(label: string): Promise<{
	id: string;
	name: string;
	email: string;
}> {
	const [user] = await db
		.insert(users)
		.values({
			email: `${FIXTURE_PREFIX}${label}-${crypto.randomUUID()}@fixture.test`,
			name: `Fixture ${label}`
		})
		.returning();

	return { id: user.id, name: user.name, email: user.email };
}

/** Removes only the users this suite created. */
export async function deleteFixtureUsers(label: string): Promise<void> {
	await db.delete(users).where(like(users.email, `${FIXTURE_PREFIX}${label}-%@fixture.test`));
}

/** True when a database is reachable; suites skip themselves otherwise. */
export const databaseReachable = await db
	.execute('select 1')
	.then(() => true)
	.catch(() => false);
