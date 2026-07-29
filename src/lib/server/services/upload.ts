import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { applications } from '../db/schema/application';
import { documents, type Document } from '../db/schema/candidate';
import { files } from '../db/schema/platform';
import { scanStoredFile } from '../scanning';
import { buildStorageKey, isAllowedMimeType, storage, type StorageScope } from '../storage';

/**
 * File uploads.
 *
 * Everything here treats the uploaded bytes as hostile: a resume is an arbitrary
 * file from a stranger that an employer will later open on their own machine.
 */

/** 10 MB. Generous for a resume, small enough that abuse is bounded. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Content types a candidate may upload as a document.
 *
 * Narrower than the storage allowlist: images belong on company logos, not on an
 * application.
 */
const DOCUMENT_TYPES = new Set([
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'text/plain'
]);

/** Leading bytes each accepted format must start with. */
const MAGIC_BYTES: Record<string, number[][]> = {
	'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
	// Both .doc (OLE compound) and .docx (zip) have fixed signatures.
	'application/msword': [[0xd0, 0xcf, 0x11, 0xe0]],
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
		[0x50, 0x4b, 0x03, 0x04]
	]
};

/**
 * Verify the bytes match the declared type.
 *
 * The browser-supplied MIME type is attacker-controlled, so an executable renamed
 * to `.pdf` arrives claiming to be a PDF. Checking the signature is what stops the
 * storage layer from holding something that is not what the database says it is.
 * `text/plain` has no signature and is checked by exclusion instead.
 */
export function looksLikeDeclaredType(bytes: Uint8Array, mimeType: string): boolean {
	const signatures = MAGIC_BYTES[mimeType];
	if (!signatures) return mimeType === 'text/plain';

	return signatures.some((signature) => signature.every((byte, index) => bytes[index] === byte));
}

export interface UploadInput {
	userId: string;
	file: File;
	scope: StorageScope;
	kind: 'resume' | 'cover_letter' | 'portfolio' | 'other';
	label?: string;
}

export async function uploadDocument(input: UploadInput): Promise<Document> {
	const { file, userId } = input;

	if (file.size === 0) error(400, 'That file is empty.');
	if (file.size > MAX_BYTES) {
		error(400, `Files must be under ${MAX_BYTES / 1024 / 1024} MB.`);
	}
	if (!DOCUMENT_TYPES.has(file.type) || !isAllowedMimeType(file.type)) {
		error(400, 'Upload a PDF, Word document or plain text file.');
	}

	const bytes = Buffer.from(await file.arrayBuffer());
	if (!looksLikeDeclaredType(bytes, file.type)) {
		error(400, 'That file does not look like the type it claims to be.');
	}

	// The key is generated, never derived from the filename.
	const key = buildStorageKey(input.scope, file.type);
	const stored = await storage.put({ key, body: bytes, contentType: file.type });

	const document = await db.transaction(async (tx) => {
		const [row] = await tx
			.insert(files)
			.values({
				key: stored.key,
				driver: storage.name,
				originalName: file.name.slice(0, 255),
				mimeType: file.type,
				sizeBytes: stored.sizeBytes,
				checksum: stored.checksum,
				uploadedByUserId: userId,
				// Nothing is served to anyone but the uploader until a scanner clears it.
				scanStatus: 'pending'
			})
			.returning();

		const [created] = await tx
			.insert(documents)
			.values({
				userId,
				fileId: row.id,
				kind: input.kind,
				label: input.label?.trim() || file.name
			})
			.returning();

		return { ...created, fileId: row.id };
	});

	// Scanned after the transaction commits and without awaiting: the candidate
	// should not wait on it, and a scanner outage must not fail the upload. The row
	// stays `pending` until a verdict lands, and `pending` is not servable.
	void scanStoredFile(document.fileId).catch((cause) => {
		console.error('File scan failed to run', { fileId: document.fileId, cause });
	});

	return document;
}

/** A user's documents of one kind, newest first. */
export async function listDocuments(
	userId: string,
	kind: 'resume' | 'cover_letter' | 'portfolio' | 'other' = 'resume'
) {
	return db
		.select({
			id: documents.id,
			label: documents.label,
			createdAt: documents.createdAt,
			sizeBytes: files.sizeBytes,
			mimeType: files.mimeType,
			originalName: files.originalName
		})
		.from(documents)
		.innerJoin(files, eq(files.id, documents.fileId))
		.where(and(eq(documents.userId, userId), eq(documents.kind, kind)))
		.orderBy(documents.createdAt);
}

/**
 * Remove a document from the candidate's list.
 *
 * Refused while an application still points at it. The foreign key is
 * `on delete set null`, so deleting here would silently strip the CV from every
 * application it was submitted with — an employer half-way through reviewing
 * somebody would find the attachment simply gone, with nothing to say why. A
 * person cannot un-send a CV they already sent, and pretending otherwise would
 * make the promise worse rather than better: the employer keeps what they were
 * given, and this is said plainly instead of being hidden by a delete that
 * quietly does damage elsewhere.
 *
 * Scoped by `userId` inside the statement rather than checked beforehand, so
 * there is no window between the check and the write.
 */
export async function deleteDocument(documentId: string, userId: string): Promise<void> {
	const [owned] = await db
		.select({ id: documents.id })
		.from(documents)
		.where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
		.limit(1);

	// Not-found rather than forbidden, for the same reason as everywhere else: the
	// existence of a document id is itself information.
	if (!owned) error(404, 'Not found.');

	const [usedBy] = await db
		.select({ id: applications.id })
		.from(applications)
		.where(eq(applications.resumeDocumentId, documentId))
		.limit(1);

	if (usedBy) {
		error(400, 'You have applied for a job with this CV, so it cannot be removed.');
	}

	await db.delete(documents).where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
}

/** Resolve a document the given user is allowed to read, for the download route. */
export async function findOwnedDocument(documentId: string, userId: string) {
	const [row] = await db
		.select({ document: documents, file: files })
		.from(documents)
		.innerJoin(files, eq(files.id, documents.fileId))
		.where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
		.limit(1);

	return row;
}
