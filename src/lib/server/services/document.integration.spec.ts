import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { applications } from '../db/schema/application';
import { documents } from '../db/schema/candidate';
import { files } from '../db/schema/platform';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import { apply } from './application';
import { deleteDocument, listDocuments } from './upload';

/** Unique per spec file, so cleanup cannot reach another suite's rows. */
const SUITE = 'document';

describe.skipIf(!databaseReachable)('removing a CV', () => {
	let fixture: JobFixture;

	beforeAll(async () => {
		fixture = await createJobFixture(SUITE);
	});

	afterAll(async () => {
		await fixture.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	/**
	 * A document row without going through storage.
	 *
	 * The upload path — magic bytes, generated keys, the scan gate — is covered by
	 * `upload.spec.ts`. What is under test here is only who may remove one.
	 */
	async function createDocument(userId: string): Promise<string> {
		const [file] = await db
			.insert(files)
			.values({
				key: `${SUITE}/${crypto.randomUUID()}.pdf`,
				driver: 'local',
				originalName: 'cv.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 1024,
				checksum: 'not-a-real-checksum',
				uploadedByUserId: userId,
				scanStatus: 'clean'
			})
			.returning();

		const [document] = await db
			.insert(documents)
			.values({ userId, fileId: file.id, kind: 'resume', label: 'CV' })
			.returning();

		return document.id;
	}

	it('removes a CV nobody has applied with', async () => {
		const userId = (await createUser(SUITE)).id;
		const documentId = await createDocument(userId);

		await deleteDocument(documentId, userId);

		expect(await listDocuments(userId)).toHaveLength(0);
	});

	it('will not remove somebody else’s CV', async () => {
		const owner = (await createUser(SUITE)).id;
		const stranger = (await createUser(SUITE)).id;
		const documentId = await createDocument(owner);

		// Not-found rather than forbidden: the existence of a document id is itself
		// information about a named person.
		await expect(deleteDocument(documentId, stranger)).rejects.toThrow();
		expect(await listDocuments(owner)).toHaveLength(1);
	});

	it('refuses to remove a CV that was sent with an application', async () => {
		const userId = (await createUser(SUITE)).id;
		const documentId = await createDocument(userId);
		await apply({ jobId: fixture.jobId, userId, resumeDocumentId: documentId });

		// The foreign key is `on delete set null`, so allowing this would silently
		// strip the CV from an application an employer may be half-way through
		// reading, with nothing on the page to say where it went.
		await expect(deleteDocument(documentId, userId)).rejects.toThrow();

		const [row] = await db
			.select({ resumeDocumentId: applications.resumeDocumentId })
			.from(applications)
			.where(eq(applications.userId, userId));

		expect(row.resumeDocumentId).toBe(documentId);
	});
});
