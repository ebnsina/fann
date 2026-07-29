import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client
} from '@aws-sdk/client-s3';
import {
	StorageObjectNotFound,
	type GetObjectResult,
	type PutObjectInput,
	type StorageDriver,
	type StoredObject
} from './types';

export interface S3DriverConfig {
	bucket: string;
	region: string;
	/** Set for S3-compatible hosts such as Cloudflare R2 or MinIO. */
	endpoint?: string;
	accessKeyId: string;
	secretAccessKey: string;
	/** R2 and MinIO require path-style addressing. */
	forcePathStyle?: boolean;
}

export function createS3Driver(config: S3DriverConfig): StorageDriver {
	const client = new S3Client({
		region: config.region,
		endpoint: config.endpoint,
		forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey
		}
	});

	return {
		name: 's3',

		async put({ key, body, contentType }: PutObjectInput): Promise<StoredObject> {
			// S3 needs a known length to avoid chunked uploads, and we need the whole
			// body to checksum it anyway. Upload size is capped well below memory
			// limits by the validation layer before anything reaches a driver.
			const buffer = Buffer.isBuffer(body)
				? body
				: body instanceof Uint8Array
					? Buffer.from(body)
					: Buffer.concat(await Readable.from(body).toArray());

			const checksum = createHash('sha256').update(buffer).digest('hex');

			await client.send(
				new PutObjectCommand({
					Bucket: config.bucket,
					Key: key,
					Body: buffer,
					ContentType: contentType,
					ContentLength: buffer.byteLength,
					// Objects are private without exception — access is mediated by an
					// authorized app route, never by a bucket policy.
					ACL: undefined
				})
			);

			return { key, sizeBytes: buffer.byteLength, checksum };
		},

		async get(key: string): Promise<GetObjectResult> {
			try {
				const response = await client.send(
					new GetObjectCommand({ Bucket: config.bucket, Key: key })
				);
				if (!response.Body) throw new StorageObjectNotFound(key);

				return {
					stream: response.Body as Readable,
					sizeBytes: response.ContentLength ?? 0,
					contentType: response.ContentType ?? 'application/octet-stream'
				};
			} catch (error) {
				if (isNotFound(error)) throw new StorageObjectNotFound(key);
				throw error;
			}
		},

		async delete(key: string): Promise<void> {
			await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
		},

		async exists(key: string): Promise<boolean> {
			try {
				await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
				return true;
			} catch (error) {
				if (isNotFound(error)) return false;
				throw error;
			}
		}
	};
}

function isNotFound(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const name = (error as { name?: string }).name;
	const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
	return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}
