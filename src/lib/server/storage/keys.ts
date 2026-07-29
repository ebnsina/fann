import { randomUUID } from 'node:crypto';

/** What a stored file belongs to. Becomes the top-level key prefix. */
export type StorageScope = 'resumes' | 'documents' | 'logos' | 'avatars' | 'attachments';

/**
 * Extensions we are willing to write, keyed by the content type we accept.
 * The extension always comes from this table — never from the uploaded filename,
 * which is attacker-controlled.
 */
const EXTENSION_BY_MIME: Record<string, string> = {
	'application/pdf': 'pdf',
	'application/msword': 'doc',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'text/plain': 'txt',
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp'
};

export function isAllowedMimeType(mimeType: string): boolean {
	return mimeType in EXTENSION_BY_MIME;
}

export function allowedMimeTypes(): string[] {
	return Object.keys(EXTENSION_BY_MIME);
}

/**
 * Build an opaque, unguessable storage key.
 *
 * Date-partitioned so a bucket listing stays navigable, and random so knowing one
 * key reveals nothing about any other. `now` is injectable so partitioning is
 * testable without freezing the clock.
 */
export function buildStorageKey(scope: StorageScope, mimeType: string, now = new Date()): string {
	const extension = EXTENSION_BY_MIME[mimeType];
	if (!extension) throw new Error(`Unsupported content type: ${mimeType}`);

	const year = now.getUTCFullYear();
	const month = String(now.getUTCMonth() + 1).padStart(2, '0');
	return `${scope}/${year}/${month}/${randomUUID()}.${extension}`;
}
