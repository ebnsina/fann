import {
	STORAGE_DRIVER,
	STORAGE_LOCAL_DIR,
	STORAGE_SIGNING_SECRET,
	S3_BUCKET,
	S3_REGION,
	S3_ENDPOINT,
	S3_ACCESS_KEY_ID,
	S3_SECRET_ACCESS_KEY
} from '$app/env/private';
import { createLocalDriver } from './local';
import { createS3Driver } from './s3';
import { createFileTokenSigner } from './tokens';
import type { StorageDriver } from './types';

export * from './types';
export * from './keys';
export type { FileTokenSigner } from './tokens';

function createDriver(): StorageDriver {
	if (STORAGE_DRIVER === 's3') {
		if (!S3_BUCKET || !S3_REGION || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
			throw new Error(
				"STORAGE_DRIVER is 's3' but S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and " +
					'S3_SECRET_ACCESS_KEY are not all set.'
			);
		}
		return createS3Driver({
			bucket: S3_BUCKET,
			region: S3_REGION,
			endpoint: S3_ENDPOINT || undefined,
			accessKeyId: S3_ACCESS_KEY_ID,
			secretAccessKey: S3_SECRET_ACCESS_KEY
		});
	}

	return createLocalDriver(STORAGE_LOCAL_DIR);
}

export const storage: StorageDriver = createDriver();

/** Signer for links that leave the session. See `./tokens.ts`. */
export const fileTokens = createFileTokenSigner(STORAGE_SIGNING_SECRET);
