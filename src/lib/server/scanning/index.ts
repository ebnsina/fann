import { eq } from 'drizzle-orm';
import { FILE_SCANNER } from '$app/env/private';
import { db } from '../db';
import { files } from '../db/schema/platform';
import { storage } from '../storage';
import { isProduction } from '../runtime';
import { clamAvOptions, scanWithClamAv } from './clamav';
import type { ScanVerdict } from './verdict';

/**
 * Malware scanning for uploaded files.
 *
 * A driver interface like storage and email, for the same reason: the decision of
 * *which* scanner runs is deployment configuration, and the rest of the app should
 * only know that a verdict exists.
 */

export type { ScanVerdict } from './verdict';

export interface Scanner {
	readonly name: string;
	scan(bytes: Buffer): Promise<ScanVerdict>;
}

/**
 * Development driver. Returns `clean` without inspecting anything.
 *
 * This is not a scanner. It exists so local development does not require a ClamAV
 * daemon, and it warns loudly at startup precisely because silently trusting
 * uploads in production is the failure this whole module is meant to prevent.
 */
function createPermissiveScanner(): Scanner {
	if (isProduction) {
		console.warn(
			'\n⚠ FILE_SCANNER is "permissive" in production. Uploaded files are being\n' +
				'  marked clean without inspection. Set FILE_SCANNER=clamav.\n'
		);
	}

	return {
		name: 'permissive',
		async scan() {
			return 'clean';
		}
	};
}

/**
 * ClamAV over its INSTREAM protocol.
 *
 * The address is read at startup rather than per scan, so a deployment that
 * selects this driver without configuring a daemon fails at boot — loudly and
 * once — instead of silently recording every upload as unscannable.
 */
function createClamAvScanner(): Scanner {
	const options = clamAvOptions();

	return {
		name: 'clamav',
		scan: (bytes) => scanWithClamAv(bytes, options)
	};
}

export const scanner: Scanner =
	FILE_SCANNER === 'clamav' ? createClamAvScanner() : createPermissiveScanner();

/**
 * Fetch a stored file, scan it, and record the verdict.
 *
 * Runs out of band so an upload does not block on it. Until this completes the
 * row stays `pending`, and `pending` is not servable.
 */
export async function scanStoredFile(fileId: string): Promise<ScanVerdict> {
	const [row] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
	if (!row) return 'failed';

	let verdict: ScanVerdict;
	try {
		const result = await storage.get(row.key);
		const bytes = Buffer.concat(await result.stream.toArray());
		verdict = await scanner.scan(bytes);
	} catch {
		// An unreadable file is not a clean file.
		verdict = 'failed';
	}

	await db.update(files).set({ scanStatus: verdict }).where(eq(files.id, fileId));
	return verdict;
}
