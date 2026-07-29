import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalDriver } from './local';
import { StorageObjectNotFound, type StorageDriver } from './types';

describe('local storage driver', () => {
	let root: string;
	let driver: StorageDriver;

	beforeEach(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'fann-storage-'));
		driver = createLocalDriver(root);
	});

	afterEach(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});

	it('round-trips a buffer and reports its size and checksum', async () => {
		const body = Buffer.from('a resume, notionally');
		const stored = await driver.put({
			key: 'resumes/2026/07/example.pdf',
			body,
			contentType: 'application/pdf'
		});

		expect(stored.sizeBytes).toBe(body.byteLength);
		expect(stored.checksum).toBe(createHash('sha256').update(body).digest('hex'));

		const result = await driver.get(stored.key);
		const readBack = Buffer.concat(await result.stream.toArray());
		expect(readBack.toString()).toBe(body.toString());
		expect(result.sizeBytes).toBe(body.byteLength);
	});

	it('checksums streamed bodies identically to buffered ones', async () => {
		const chunks = ['first chunk ', 'second chunk'];
		const whole = Buffer.from(chunks.join(''));

		const stored = await driver.put({
			key: 'documents/2026/07/streamed.txt',
			body: Readable.from(chunks.map((chunk) => Buffer.from(chunk))),
			contentType: 'text/plain'
		});

		expect(stored.sizeBytes).toBe(whole.byteLength);
		expect(stored.checksum).toBe(createHash('sha256').update(whole).digest('hex'));

		const result = await driver.get(stored.key);
		expect(Buffer.concat(await result.stream.toArray()).toString()).toBe(whole.toString());
	});

	it('creates nested directories for a key', async () => {
		await driver.put({
			key: 'logos/2026/07/nested.png',
			body: Buffer.from([1, 2, 3]),
			contentType: 'image/png'
		});
		expect(await driver.exists('logos/2026/07/nested.png')).toBe(true);
	});

	it('reports a missing object rather than throwing a filesystem error', async () => {
		await expect(driver.get('resumes/2026/07/absent.pdf')).rejects.toThrow(StorageObjectNotFound);
		expect(await driver.exists('resumes/2026/07/absent.pdf')).toBe(false);
	});

	it('deletes idempotently', async () => {
		const key = 'documents/2026/07/temp.txt';
		await driver.put({ key, body: Buffer.from('x'), contentType: 'text/plain' });

		await driver.delete(key);
		expect(await driver.exists(key)).toBe(false);
		// A second delete must not throw — callers retry cleanup.
		await expect(driver.delete(key)).resolves.toBeUndefined();
	});

	it('refuses keys that escape the storage root', async () => {
		const escape = `../${randomUUID()}.txt`;

		await expect(
			driver.put({ key: escape, body: Buffer.from('nope'), contentType: 'text/plain' })
		).rejects.toThrow(/escapes the root/);
		await expect(driver.get(escape)).rejects.toThrow(/escapes the root/);
		await expect(driver.delete(escape)).rejects.toThrow(/escapes the root/);

		// And nothing was written outside the root.
		await expect(fs.access(path.resolve(root, escape))).rejects.toThrow();
	});
});
