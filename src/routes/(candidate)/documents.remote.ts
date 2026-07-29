import * as v from 'valibot';
import { command, form } from '$app/server';
import { requireUser } from '#lib/server/auth/guards';
import * as uploads from '#lib/server/services/upload';
import { myResumes } from './applications.remote';

/**
 * Uploading and removing CVs.
 *
 * The list itself is `myResumes`, which already exists for the apply form's
 * picker. One query rather than two: a second list of the same rows would mean
 * uploading here left the apply page showing yesterday's set.
 */

const uploadSchema = v.object({
	file: v.file('Choose a file.'),
	label: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120, 'That name is too long.')), '')
});

export const uploadResume = form(uploadSchema, async ({ file, label }) => {
	const user = requireUser();

	// Every check that matters — size, type, magic bytes, generated key — is in the
	// service, because this form is not the only way bytes get in.
	await uploads.uploadDocument({
		userId: user.id,
		file,
		scope: 'resumes',
		kind: 'resume',
		label: label || undefined
	});

	await myResumes().refresh();
	return { uploaded: true };
});

export const deleteResume = command(v.pipe(v.string(), v.uuid()), async (documentId) => {
	const user = requireUser();

	await uploads.deleteDocument(documentId, user.id);
	await myResumes().refresh();

	return { deleted: true };
});
