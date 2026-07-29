import { eq, like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { files } from '../db/schema/platform';
import { storage } from '../storage';
import { scanStoredFile, scanner } from './index';

const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR', '-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(
	''
);

const reachable = await db
	.execute('select 1')
	.then(() => true)
	.catch(() => false);

/**
 * The gate, end to end, with a scanner that actually scans.
 *
 * Everything else here tests a piece: the wire format against a fake, the verdict
 * recording against a permissive driver. This is the only test that puts a real
 * malicious payload through the real path and checks the row it lands in — which
 * is the thing the whole module exists to guarantee.
 *
 * Skipped unless the configured driver actually inspects bytes, because under
 * `permissive` it would pass by returning "clean" for everything, which is
 * exactly the false confidence it is meant to catch.
 */
describe.skipIf(!reachable || scanner.name === 'permissive')('the scan gate, for real', () => {
	afterAll(async () => {
		await db.delete(files).where(like(files.key, '%/gate-test/%'));
	});

	async function store(body: Buffer): Promise<string> {
		const key = `resumes/gate-test/${crypto.randomUUID()}.pdf`;
		const stored = await storage.put({ key, body, contentType: 'application/pdf' });

		const [row] = await db
			.insert(files)
			.values({
				key: stored.key,
				driver: storage.name,
				originalName: 'gate-test.pdf',
				mimeType: 'application/pdf',
				sizeBytes: stored.sizeBytes,
				checksum: stored.checksum,
				scanStatus: 'pending'
			})
			.returning();

		return row.id;
	}

	it('marks a malicious upload infected', async () => {
		const fileId = await store(Buffer.from(EICAR));

		expect(await scanStoredFile(fileId)).toBe('infected');

		// The row is what `resolveForViewer` reads, so this is the state that decides
		// whether a recruiter can open the file.
		const [row] = await db.select().from(files).where(eq(files.id, fileId));
		expect(row.scanStatus).toBe('infected');
	});

	it('marks an ordinary upload clean', async () => {
		const fileId = await store(Buffer.from('%PDF-1.4\n%%EOF'));

		expect(await scanStoredFile(fileId)).toBe('clean');
	});
});
