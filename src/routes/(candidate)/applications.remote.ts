import * as v from 'valibot';
import { redirect } from '@sveltejs/kit';
import { command, form, getRequestEvent, query } from '$app/server';
import { requireUser, requireVerifiedUser } from '#lib/server/auth/guards';
import { RULES, enforce } from '#lib/server/rate-limit';
import * as applicationService from '#lib/server/services/application';
import * as offerService from '#lib/server/services/offer';
import * as uploads from '#lib/server/services/upload';

/** The signed-in candidate's applications. */
export const myApplications = query(async () => {
	const user = requireUser();
	return applicationService.listForUser(user.id);
});

/**
 * Offers waiting on the signed-in candidate.
 *
 * Its own query rather than a join into `myApplications`, so accepting one
 * refreshes the offer without re-fetching every application on the page.
 */
export const myOffers = query(async () => {
	const user = requireUser();
	return offerService.sentForCandidate(user.id);
});

const offerDecisionSchema = v.object({
	offerId: v.pipe(v.string(), v.uuid()),
	decision: v.picklist(['accepted', 'declined'] as const)
});

/**
 * Accept or decline an offer.
 *
 * The candidate's own decision, recorded as theirs — `respondAsCandidate` takes
 * the id from the session, so the signer of a decision cannot be named by the
 * request. Verified, for the same reason applying is: this ends with an employer
 * emailing a real person.
 */
export const respondToOffer = command(offerDecisionSchema, async ({ offerId, decision }) => {
	const user = requireVerifiedUser();

	const offer = await offerService.respondAsCandidate(
		offerId,
		user.id,
		decision,
		getRequestEvent().url.origin
	);

	// Accepting marks the application hired, so the list beside it is now stale.
	await Promise.all([myOffers().refresh(), myApplications().refresh()]);

	return { status: offer.status };
});

/** The candidate-visible timeline for one application. */
export const applicationTimeline = query(v.string(), async (applicationId) => {
	const user = requireUser();
	return applicationService.timelineForCandidate(applicationId, user.id);
});

/** Resumes the candidate has uploaded, for the apply form's picker. */
export const myResumes = query(async () => {
	const user = requireUser();
	return uploads.listDocuments(user.id, 'resume');
});

const applySchema = v.object({
	jobId: v.pipe(v.string(), v.uuid()),
	resumeDocumentId: v.optional(v.pipe(v.string(), v.uuid())),
	/** Optional file, when the candidate uploads instead of picking an existing one. */
	resumeFile: v.optional(v.file()),
	coverLetter: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(5000)), '')
});

export const applyToJob = form(
	applySchema,
	async ({ jobId, resumeDocumentId, resumeFile, coverLetter }) => {
		// Verified, because an application carries the candidate's contact details and
		// an unverified address means the employer cannot actually reply.
		const user = requireVerifiedUser();

		// Bounded per account: applying is cheap for a person and cheap to automate.
		await enforce(RULES.apply, [`user:${user.id}`]);

		let documentId = resumeDocumentId ?? null;

		if (resumeFile && resumeFile.size > 0) {
			const document = await uploads.uploadDocument({
				userId: user.id,
				file: resumeFile,
				scope: 'resumes',
				kind: 'resume'
			});
			documentId = document.id;
		}

		await applicationService.apply({
			jobId,
			userId: user.id,
			resumeDocumentId: documentId,
			coverLetter: coverLetter || null,
			// Enables the confirmation email, and gives it absolute links.
			origin: getRequestEvent().url.origin
		});

		await Promise.all([myApplications().refresh(), myResumes().refresh()]);
		redirect(303, '/me/applications?applied=1');
	}
);

export const withdrawApplication = command(v.pipe(v.string(), v.uuid()), async (applicationId) => {
	const user = requireUser();

	await applicationService.withdraw(applicationId, user.id);
	await myApplications().refresh();

	return { withdrawn: true };
});

/** Whether the signed-in user has already applied — drives the job page's button. */
export const hasApplied = query(v.pipe(v.string(), v.uuid()), async (jobId) => {
	const { locals } = getRequestEvent();
	if (!locals.user) return false;

	return applicationService.hasApplied(jobId, locals.user.id);
});
