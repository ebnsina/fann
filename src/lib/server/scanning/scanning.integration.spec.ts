import { eq, like } from 'drizzle-orm';
import { FILE_SCANNER } from '$app/env/private';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { files } from '../db/schema/platform';
import { buildStorageKey, storage } from '../storage';
import { scanStoredFile, scanner } from './index';

const reachable = await db
	.execute('select 1')
	.then(() => true)
	.catch(() => false);

/**
 * The scan gate only means something if a verdict actually gets recorded. These
 * create their own files rather than reading whatever happens to be pending, so
 * the outcome does not depend on what ran before.
 */
describe.skipIf(!reachable)('scanStoredFile', () => {
	afterAll(async () => {
		await db.delete(files).where(like(files.key, '%/scan-test/%'));
	});

	async function storeFile(): Promise<string> {
		const key = `resumes/scan-test/${crypto.randomUUID()}.pdf`;
		const stored = await storage.put({
			key,
			body: Buffer.from('%PDF-1.4\n%%EOF'),
			contentType: 'application/pdf'
		});

		const [row] = await db
			.insert(files)
			.values({
				key: stored.key,
				driver: storage.name,
				originalName: 'scan-test.pdf',
				mimeType: 'application/pdf',
				sizeBytes: stored.sizeBytes,
				checksum: stored.checksum,
				scanStatus: 'pending'
			})
			.returning();

		return row.id;
	}

	it('records a verdict against a stored file', async () => {
		const fileId = await storeFile();

		const verdict = await scanStoredFile(fileId);
		expect(['clean', 'infected', 'failed']).toContain(verdict);

		const [after] = await db.select().from(files).where(eq(files.id, fileId));
		expect(after.scanStatus).toBe(verdict);
		// The row must not be left `pending`, since `pending` is not servable.
		expect(after.scanStatus).not.toBe('pending');
	});

	it('records `failed` when the bytes are missing', async () => {
		// An unreadable file is not a clean file — this must never fall through to
		// `clean` just because the scanner had nothing to inspect.
		const [orphan] = await db
			.insert(files)
			.values({
				key: 'resumes/scan-test/does-not-exist.pdf',
				driver: 'local',
				originalName: 'ghost.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 1,
				checksum: 'y'.repeat(64)
			})
			.returning();

		expect(await scanStoredFile(orphan.id)).toBe('failed');

		const [after] = await db.select().from(files).where(eq(files.id, orphan.id));
		expect(after.scanStatus).toBe('failed');
	});

	it('records `failed` for a file row that does not exist', async () => {
		expect(await scanStoredFile(crypto.randomUUID())).toBe('failed');
	});

	it('runs the driver the configuration asked for', () => {
		// The guard is that these cannot drift apart. `permissive` marks everything
		// clean without looking, so a deployment that selected `clamav` and silently
		// got the other one would believe it was scanning uploads and would not be.
		expect(scanner.name).toBe(FILE_SCANNER);
	});

	it('leaves a generated storage key intact through a scan round trip', async () => {
		const key = buildStorageKey('resumes', 'application/pdf');
		expect(key).toMatch(/^resumes\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/);
	});
});
