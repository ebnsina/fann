import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
	StorageObjectNotFound,
	type GetObjectResult,
	type PutObjectInput,
	type StorageDriver,
	type StoredObject
} from './types';

/**
 * Development driver. Writes under a directory that must sit outside `static/`,
 * so nothing it holds is ever served as a static asset.
 */
export function createLocalDriver(rootDir: string): StorageDriver {
	const root = path.resolve(rootDir);

	/**
	 * Resolve a key to an absolute path and refuse anything that escapes the root.
	 * Keys are generated internally, but this is the last line of defence against
	 * a path-traversal bug upstream turning into arbitrary file read/write.
	 */
	function resolveKey(key: string): string {
		const resolved = path.resolve(root, key);
		if (resolved !== root && !resolved.startsWith(root + path.sep)) {
			throw new Error(`Storage key escapes the root directory: ${key}`);
		}
		return resolved;
	}

	return {
		name: 'local',

		async put({ key, body, contentType }: PutObjectInput): Promise<StoredObject> {
			const target = resolveKey(key);
			await fs.mkdir(path.dirname(target), { recursive: true });

			const hash = createHash('sha256');
			let sizeBytes = 0;

			if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
				const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
				hash.update(buffer);
				sizeBytes = buffer.byteLength;
				await fs.writeFile(target, buffer);
			} else {
				// Tee the stream through the hash so the file is only read once.
				const tee = new Readable({ read() {} });
				body.on('data', (chunk: Buffer) => {
					hash.update(chunk);
					sizeBytes += chunk.byteLength;
					tee.push(chunk);
				});
				body.on('end', () => tee.push(null));
				body.on('error', (error) => tee.destroy(error));

				const handle = await fs.open(target, 'w');
				try {
					await pipeline(tee, handle.createWriteStream());
				} finally {
					await handle.close();
				}
			}

			// Content type is recorded in the `files` row, not on disk.
			void contentType;

			return { key, sizeBytes, checksum: hash.digest('hex') };
		},

		async get(key: string): Promise<GetObjectResult> {
			const target = resolveKey(key);
			let stat: Awaited<ReturnType<typeof fs.stat>>;
			try {
				stat = await fs.stat(target);
			} catch {
				throw new StorageObjectNotFound(key);
			}

			return {
				stream: createReadStream(target),
				sizeBytes: stat.size,
				// The authoritative content type lives in the `files` row; the caller
				// overrides this from the database rather than trusting the filesystem.
				contentType: 'application/octet-stream'
			};
		},

		async delete(key: string): Promise<void> {
			await fs.rm(resolveKey(key), { force: true });
		},

		async exists(key: string): Promise<boolean> {
			try {
				await fs.access(resolveKey(key));
				return true;
			} catch {
				return false;
			}
		}
	};
}
