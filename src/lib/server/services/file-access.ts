import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { applications } from '../db/schema/application';
import { documents } from '../db/schema/candidate';
import { orgMembers } from '../db/schema/org';
import { files, type storageDriverEnum } from '../db/schema/platform';

/**
 * Who is allowed to read an uploaded document.
 *
 * A resume is the most sensitive thing in this product: a named person's contact
 * details, employment history and often their address, handed over on the
 * understanding that one company will read it. The rules here are deliberately
 * narrow and enumerated rather than derived.
 */

export type AccessDenial = 'not_found' | 'unscanned' | 'infected';

export interface AccessibleFile {
	fileId: string;
	key: string;
	driver: (typeof storageDriverEnum.enumValues)[number];
	mimeType: string;
	sizeBytes: number;
	/** The name to offer on download. Display only — never used as a path. */
	originalName: string;
}

export type AccessResult = { ok: true; file: AccessibleFile } | { ok: false; reason: AccessDenial };

/**
 * Resolve a document for a viewer, or explain why not.
 *
 * Two ways in, and only two:
 *   1. The uploader, always.
 *   2. A member of an organization the candidate actually applied to, and only
 *      for the resume attached to *that* application. Membership alone is not
 *      enough — otherwise any recruiter could read any candidate's resume by id.
 */
export async function resolveForViewer(
	documentId: string,
	viewerUserId: string
): Promise<AccessResult> {
	const [row] = await db
		.select({ document: documents, file: files })
		.from(documents)
		.innerJoin(files, eq(files.id, documents.fileId))
		.where(eq(documents.id, documentId))
		.limit(1);

	if (!row) return { ok: false, reason: 'not_found' };

	const isOwner = row.document.userId === viewerUserId;

	if (!isOwner && !(await viewerReceivedThisDocument(documentId, viewerUserId))) {
		// 404, not 403 — confirming a document exists to someone with no claim on it
		// tells them a person applied somewhere.
		return { ok: false, reason: 'not_found' };
	}

	// The scan gate. The uploader may retrieve their own file at any time, since
	// they already have it; nobody else sees anything until a scanner clears it.
	if (!isOwner) {
		if (row.file.scanStatus === 'infected') return { ok: false, reason: 'infected' };
		if (row.file.scanStatus !== 'clean') return { ok: false, reason: 'unscanned' };
	}

	return {
		ok: true,
		file: {
			fileId: row.file.id,
			key: row.file.key,
			driver: row.file.driver,
			mimeType: row.file.mimeType,
			sizeBytes: row.file.sizeBytes,
			originalName: row.file.originalName
		}
	};
}

/**
 * True when the viewer belongs to an organization that received an application
 * carrying this exact document.
 */
async function viewerReceivedThisDocument(
	documentId: string,
	viewerUserId: string
): Promise<boolean> {
	const [match] = await db
		.select({ id: applications.id })
		.from(applications)
		.innerJoin(
			orgMembers,
			and(
				eq(orgMembers.organizationId, applications.organizationId),
				eq(orgMembers.userId, viewerUserId)
			)
		)
		.where(eq(applications.resumeDocumentId, documentId))
		.limit(1);

	return Boolean(match);
}
