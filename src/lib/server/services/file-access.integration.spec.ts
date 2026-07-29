import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { applications } from '../db/schema/application';
import { documents } from '../db/schema/candidate';
import { orgMembers } from '../db/schema/org';
import { files } from '../db/schema/platform';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import { resolveForViewer } from './file-access';

/** Unique per spec file, so cleanup cannot reach another suite's rows. */
const SUITE = 'access';

/**
 * A resume is a named person's contact details and history, handed over on the
 * understanding that one company reads it. These tests exist because a bug here
 * is a privacy breach, not a broken page.
 */
describe.skipIf(!databaseReachable)('document access', () => {
	let candidateId: string;
	let documentId: string;
	let fileId: string;
	let fixture: JobFixture;
	let outsiderFixture: JobFixture;
	let jobId: string;
	let organizationId: string;
	let recruiterId: string;

	async function makeUser(): Promise<string> {
		return (await createUser(SUITE)).id;
	}

	async function makeDocument(ownerId: string, scan: 'pending' | 'clean' | 'infected') {
		const [file] = await db
			.insert(files)
			.values({
				key: `resumes/test/${crypto.randomUUID()}.pdf`,
				driver: 'local',
				originalName: 'resume.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 1024,
				checksum: 'x'.repeat(64),
				uploadedByUserId: ownerId,
				scanStatus: scan
			})
			.returning();

		const [document] = await db
			.insert(documents)
			.values({ userId: ownerId, fileId: file.id, kind: 'resume', label: 'Resume' })
			.returning();

		return { documentId: document.id, fileId: file.id };
	}

	beforeAll(async () => {
		// Two organizations: one the candidate applied to, one they did not.
		fixture = await createJobFixture(SUITE);
		outsiderFixture = await createJobFixture(`${SUITE}-outsider`);
		jobId = fixture.jobId;
		organizationId = fixture.organizationId;

		candidateId = await makeUser();
		recruiterId = await makeUser();

		await db.insert(orgMembers).values({ organizationId, userId: recruiterId, role: 'recruiter' });

		({ documentId, fileId } = await makeDocument(candidateId, 'clean'));

		await db.insert(applications).values({
			jobId,
			organizationId,
			userId: candidateId,
			resumeDocumentId: documentId
		});
	});

	afterAll(async () => {
		await deleteFixtureUsers(SUITE);
		await fixture.cleanup();
		await outsiderFixture.cleanup();
		await db.delete(files).where(like(files.key, 'resumes/test/%'));
	});

	it('lets the owner read their own document', async () => {
		const result = await resolveForViewer(documentId, candidateId);

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.file.originalName).toBe('resume.pdf');
	});

	it('lets a member of the organization that received the application read it', async () => {
		const result = await resolveForViewer(documentId, recruiterId);
		expect(result.ok).toBe(true);
	});

	it('refuses an unrelated signed-in user', async () => {
		const stranger = await makeUser();
		const result = await resolveForViewer(documentId, stranger);

		expect(result).toEqual({ ok: false, reason: 'not_found' });
	});

	it('refuses a recruiter at a company the candidate did not apply to', async () => {
		// Membership somewhere is not membership everywhere. Without this rule, any
		// recruiter could read any candidate's resume by guessing an id.
		const outsider = await makeUser();
		await db
			.insert(orgMembers)
			.values({ organizationId: outsiderFixture.organizationId, userId: outsider, role: 'owner' });

		const result = await resolveForViewer(documentId, outsider);
		expect(result).toEqual({ ok: false, reason: 'not_found' });
	});

	it('refuses a document that does not exist', async () => {
		const result = await resolveForViewer(crypto.randomUUID(), candidateId);
		expect(result).toEqual({ ok: false, reason: 'not_found' });
	});

	describe('scan gate', () => {
		it('withholds an unscanned document from the employer', async () => {
			await db.update(files).set({ scanStatus: 'pending' }).where(eq(files.id, fileId));

			const result = await resolveForViewer(documentId, recruiterId);
			expect(result).toEqual({ ok: false, reason: 'unscanned' });

			await db.update(files).set({ scanStatus: 'clean' }).where(eq(files.id, fileId));
		});

		it('withholds an infected document from the employer', async () => {
			await db.update(files).set({ scanStatus: 'infected' }).where(eq(files.id, fileId));

			const result = await resolveForViewer(documentId, recruiterId);
			expect(result).toEqual({ ok: false, reason: 'infected' });

			await db.update(files).set({ scanStatus: 'clean' }).where(eq(files.id, fileId));
		});

		it('withholds a document whose scan failed', async () => {
			await db.update(files).set({ scanStatus: 'failed' }).where(eq(files.id, fileId));

			const result = await resolveForViewer(documentId, recruiterId);
			expect(result).toEqual({ ok: false, reason: 'unscanned' });

			await db.update(files).set({ scanStatus: 'clean' }).where(eq(files.id, fileId));
		});

		it('still lets the owner retrieve their own unscanned file', async () => {
			// They uploaded it; withholding it from them protects nobody.
			await db.update(files).set({ scanStatus: 'pending' }).where(eq(files.id, fileId));

			const result = await resolveForViewer(documentId, candidateId);
			expect(result.ok).toBe(true);

			await db.update(files).set({ scanStatus: 'clean' }).where(eq(files.id, fileId));
		});
	});

	it('does not expose a document that was never attached to an application', async () => {
		const loner = await makeUser();
		const orphan = await makeDocument(loner, 'clean');

		// The recruiter has no application referencing it, so no route in.
		const result = await resolveForViewer(orphan.documentId, recruiterId);
		expect(result).toEqual({ ok: false, reason: 'not_found' });
	});
});
