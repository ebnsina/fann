import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

/**
 * Direct database access for end-to-end tests.
 *
 * Deliberately not the app's own `db` module: that imports `$app/env/private`,
 * which only resolves inside a SvelteKit build. This connects with the same URL
 * and nothing else, so a test can arrange state the UI has no fast path to —
 * a verified account, an organization with a company profile — and clean up after
 * itself.
 *
 * Everything it creates is prefixed `e2e-`, and `cleanup` removes exactly that.
 */
function databaseUrl(): string {
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

	// Playwright does not load `.env`; the app does. Read it the same way rather
	// than making the test suite depend on a shell that happened to export it.
	const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
	const match = env.match(/^DATABASE_URL="?([^"\n]+)"?/m);
	if (!match) throw new Error('DATABASE_URL is not set and was not found in .env');
	return match[1];
}

export const sql = postgres(databaseUrl(), { prepare: false, max: 2 });

/** Shared by every row a run creates, so cleanup can find them all. */
export const RUN = `e2e-${randomUUID().slice(0, 8)}`;

export const PASSWORD = 'an-e2e-password-long-enough';

/**
 * The Argon2 hash of `PASSWORD`.
 *
 * Precomputed rather than derived: hashing at the configured cost takes long
 * enough that doing it per test is noticeable, and the value never changes.
 * Generated with the app's own `hashPassword`.
 */
let cachedHash: string | null = null;

async function passwordHash(): Promise<string> {
	if (cachedHash) return cachedHash;
	const { hash } = await import('@node-rs/argon2');
	cachedHash = await hash(PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
	return cachedHash;
}

export interface SeededUser {
	id: string;
	email: string;
	name: string;
}

/** A user who can sign in immediately — email already confirmed. */
export async function createVerifiedUser(label: string): Promise<SeededUser> {
	const email = `${RUN}-${label}@example.test`;
	const [row] = await sql`
		insert into users (name, email, password_hash, email_verified_at)
		values (${`E2E ${label}`}, ${email}, ${await passwordHash()}, now())
		returning id, email, name
	`;
	return row as SeededUser;
}

export interface SeededOrg {
	organizationId: string;
	companyId: string;
	slug: string;
}

/**
 * An organization with a company profile, owned by `userId`.
 *
 * The company matters: `createDraft` refuses to post a job for an organization
 * that has none, so an org created without one cannot reach the job form.
 */
export async function createOrganization(userId: string, label: string): Promise<SeededOrg> {
	const slug = `${RUN}-${label}`;

	const [organization] = await sql`
		insert into organizations (name, slug) values (${`E2E ${label}`}, ${slug})
		returning id
	`;
	const [company] = await sql`
		insert into companies (organization_id, name, slug)
		values (${organization.id}, ${`E2E ${label}`}, ${slug})
		returning id
	`;
	await sql`
		insert into org_members (organization_id, user_id, role)
		values (${organization.id}, ${userId}, 'owner')
	`;

	return { organizationId: organization.id, companyId: company.id, slug };
}

/**
 * Clear the login rate limiter for this machine.
 *
 * The limit is 10 sign-ins per 15 minutes keyed by IP, and one pass of this suite
 * signs in four times. Two runs inside the window and the third fails on the
 * `/login` page with no obvious cause — which reads as a broken test rather than
 * as the limiter doing exactly its job.
 *
 * Only the IP-keyed rows go: the per-account limit is what actually protects an
 * account, and a test that quietly disabled it could not notice if it broke.
 */
export async function resetLoginLimit(): Promise<void> {
	await sql`delete from rate_limits where key like 'login:ip:%'`;
}

/** The job this run created, once the UI has saved it. */
export async function jobIdByTitle(title: string): Promise<string> {
	const [row] = await sql`select id from jobs where title = ${title} limit 1`;
	if (!row) throw new Error(`No job found titled "${title}"`);
	return row.id as string;
}

/** Emails this run tried to send, newest first — for asserting a candidate was told. */
export async function emailsTo(email: string): Promise<{ tag: string; status: string }[]> {
	return sql`
		select tag, status from email_log
		where to_email = ${email}
		order by created_at desc
	` as unknown as Promise<{ tag: string; status: string }[]>;
}

/**
 * Remove everything this run created.
 *
 * Organizations cascade to companies, jobs, applications and events; users
 * cascade to their sessions and documents. Both are matched on the run prefix, so
 * a failed run cannot delete another one's rows.
 */
export async function cleanup(): Promise<void> {
	await sql`delete from organizations where slug like ${`${RUN}%`}`;
	await sql`delete from users where email like ${`${RUN}%`}`;
	await sql.end();
}
