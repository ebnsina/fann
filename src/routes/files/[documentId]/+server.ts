import { error } from '@sveltejs/kit';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';
import { resolveForViewer } from '#lib/server/services/file-access';
import { storage } from '#lib/server/storage';

/**
 * Authorized document download.
 *
 * The only way bytes leave storage. Deliberately a route rather than a signed
 * public URL: authorization is re-checked on every request, so revoking access —
 * a recruiter leaving a company, a candidate withdrawing — takes effect
 * immediately rather than whenever a token happens to expire.
 */
export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	if (!locals.user) error(401, 'You need to be signed in.');

	const result = await resolveForViewer(params.documentId, locals.user.id);

	if (!result.ok) {
		if (result.reason === 'infected') error(403, 'That file failed a malware scan.');
		if (result.reason === 'unscanned') {
			error(409, 'That file is still being scanned. Try again shortly.');
		}
		error(404, 'Not found.');
	}

	const { file } = result;
	const object = await storage.get(file.key);

	setHeaders({
		// The database is authoritative about the type, not the filesystem.
		'content-type': file.mimeType,
		'content-length': String(file.sizeBytes),
		/**
		 * `attachment` so a PDF or HTML-ish payload is downloaded rather than
		 * rendered in our origin, where it could script against a logged-in session.
		 * The filename is quoted and stripped of quotes and control characters,
		 * since it is user-supplied.
		 */
		'content-disposition': `attachment; filename="${sanitizeFilename(file.originalName)}"`,
		// Private and unstored: a shared cache must never hold someone's resume.
		'cache-control': 'private, no-store',
		'x-content-type-options': 'nosniff'
	});

	return new Response(Readable.toWeb(object.stream) as ReadableStream);
};

/** Strip anything that could break out of the quoted header value. */
function sanitizeFilename(name: string): string {
	// eslint-disable-next-line no-control-regex -- control characters are exactly what we are removing
	return name.replace(/[\u0000-\u001f"\\]/g, '').slice(0, 200) || 'download';
}
