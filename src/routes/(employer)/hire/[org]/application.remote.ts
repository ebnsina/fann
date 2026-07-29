import * as v from 'valibot';
import { command, getRequestEvent, query } from '$app/server';
import { requirePermission } from '#lib/server/auth/guards';
import * as applicationService from '#lib/server/services/application';
import * as noteService from '#lib/server/services/note';
import * as pipeline from '#lib/server/services/pipeline';
import * as scorecardService from '#lib/server/services/scorecard';
import * as tagService from '#lib/server/services/tag';
import * as interviewService from '#lib/server/services/interview';
import * as offerService from '#lib/server/services/offer';

/**
 * One application, in detail.
 *
 * `application.view` reads; `application.note` writes a note. An interviewer holds
 * both — they are here to form an opinion and record it — but not `advance` or
 * `reject`, so the page shows them the candidate without the decision buttons.
 */

const uuid = v.pipe(v.string(), v.uuid());

export const getApplication = query(
	v.object({ orgSlug: v.string(), applicationId: uuid }),
	async ({ orgSlug, applicationId }) => {
		const { organizationId, role, user } = await requirePermission(orgSlug, 'application.view');

		const application = await applicationService.detailForOrg(applicationId, organizationId);

		// Sequential rather than parallel: the stage list is scoped by the job id that
		// comes out of the application, and the notes and timeline are only worth
		// fetching once the application is known to belong to this organization.
		const [stages, notes, timeline, panel, tags, interviews, offers] = await Promise.all([
			pipeline.listStages(application.jobId),
			noteService.listNotes(applicationId, organizationId),
			noteService.internalTimeline(applicationId, organizationId),
			// Takes the viewer, and decides what they may see. Filtering afterwards
			// would be one forgotten line away from showing an interviewer the scores
			// they were meant to form an opinion without.
			scorecardService.panelFor(applicationId, organizationId, user.id),
			tagService.listForApplication(applicationId, organizationId),
			interviewService.listForApplication(applicationId, organizationId),
			offerService.listForApplication(applicationId, organizationId)
		]);

		return { application, stages, notes, timeline, panel, tags, interviews, offers, role };
	}
);

/**
 * Record that somebody opened this application.
 *
 * Never surfaced to the candidate — "someone looked at your CV" with no decision
 * behind it is anxiety, not transparency. It is here for the employer's own
 * history.
 */
export const viewApplication = command(
	v.object({ orgSlug: v.string(), applicationId: uuid }),
	async ({ orgSlug, applicationId }) => {
		const { organizationId, user } = await requirePermission(orgSlug, 'application.view');
		await applicationService.recordView(applicationId, organizationId, user.id);
		return { recorded: true };
	}
);

export const addNote = command(
	v.object({
		orgSlug: v.string(),
		applicationId: uuid,
		body: v.pipe(
			v.string(),
			v.trim(),
			v.nonEmpty('Write something first.'),
			v.maxLength(4000, 'That is longer than a note wants to be.')
		)
	}),
	async ({ orgSlug, applicationId, body }) => {
		const { organizationId, user } = await requirePermission(orgSlug, 'application.note');
		const note = await noteService.addNote(applicationId, organizationId, user.id, body);

		await getApplication({ orgSlug, applicationId }).refresh();
		return { id: note.id };
	}
);

export const deleteNote = command(
	v.object({ orgSlug: v.string(), applicationId: uuid, noteId: uuid }),
	async ({ orgSlug, applicationId, noteId }) => {
		// Deliberately `application.note`, not an admin permission. The service then
		// refuses anything that is not the caller's own note — an admin quietly
		// removing a colleague's objection is the failure a history exists to prevent.
		const { organizationId, user } = await requirePermission(orgSlug, 'application.note');
		await noteService.deleteNote(noteId, applicationId, organizationId, user.id);

		await getApplication({ orgSlug, applicationId }).refresh();
		return { deleted: true };
	}
);

/**
 * Save or submit the caller's own scorecard.
 *
 * `scorecard.submit` — held by interviewers, who cannot advance or reject. The
 * interviewer id comes from the session, never the request: a scorecard is a
 * signed opinion, and letting a caller name the signer defeats the point.
 */
export const saveScorecard = command(
	v.object({
		orgSlug: v.string(),
		applicationId: uuid,
		overall: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(4))),
		summary: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(4000))),
		ratings: v.optional(
			v.array(
				v.object({
					criterionId: uuid,
					rating: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(4)),
					comment: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(1000)))
				})
			)
		),
		submit: v.optional(v.boolean())
	}),
	async ({ orgSlug, applicationId, overall, summary, ratings, submit }) => {
		const { organizationId, user } = await requirePermission(orgSlug, 'scorecard.submit');

		const result = await scorecardService.save({
			applicationId,
			organizationId,
			interviewerUserId: user.id,
			overall,
			summary,
			ratings,
			submit
		});

		await getApplication({ orgSlug, applicationId }).refresh();
		return result;
	}
);

/* ---------------------------------------------------------------------------
   Tags
   --------------------------------------------------------------------------- */

export const addTag = command(
	v.object({
		orgSlug: v.string(),
		applicationId: uuid,
		name: v.pipe(v.string(), v.trim(), v.nonEmpty('Give the tag a name.'), v.maxLength(40))
	}),
	async ({ orgSlug, applicationId, name }) => {
		const { organizationId } = await requirePermission(orgSlug, 'application.note');
		await tagService.attach(applicationId, organizationId, name);

		await getApplication({ orgSlug, applicationId }).refresh();
		return { added: true };
	}
);

export const removeTag = command(
	v.object({ orgSlug: v.string(), applicationId: uuid, tagId: uuid }),
	async ({ orgSlug, applicationId, tagId }) => {
		const { organizationId } = await requirePermission(orgSlug, 'application.note');
		await tagService.detach(applicationId, organizationId, tagId);

		await getApplication({ orgSlug, applicationId }).refresh();
		return { removed: true };
	}
);

/* ---------------------------------------------------------------------------
   Interviews
   --------------------------------------------------------------------------- */

export const scheduleInterview = command(
	v.object({
		orgSlug: v.string(),
		applicationId: uuid,
		title: v.pipe(v.string(), v.trim(), v.nonEmpty('Give the interview a name.'), v.maxLength(120)),
		mode: v.picklist(['video', 'phone', 'onsite']),
		location: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500))),
		/** An ISO instant. The client sends UTC; the server never guesses a zone. */
		startsAt: v.pipe(v.string(), v.isoTimestamp('That is not a valid date and time.')),
		durationMinutes: v.pipe(v.number(), v.integer(), v.minValue(5), v.maxValue(480)),
		notes: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2000))),
		participantUserIds: v.optional(v.array(uuid))
	}),
	async ({ orgSlug, applicationId, startsAt, participantUserIds, ...rest }) => {
		const { organizationId, user } = await requirePermission(orgSlug, 'interview.schedule');
		const { url } = getRequestEvent();

		await interviewService.schedule({
			...rest,
			applicationId,
			organizationId,
			actorUserId: user.id,
			startsAt: new Date(startsAt),
			participantUserIds: participantUserIds ?? [],
			origin: url.origin
		});

		await getApplication({ orgSlug, applicationId }).refresh();
		return { scheduled: true };
	}
);

export const cancelInterview = command(
	v.object({ orgSlug: v.string(), applicationId: uuid, interviewId: uuid }),
	async ({ orgSlug, applicationId, interviewId }) => {
		const { organizationId, user } = await requirePermission(orgSlug, 'interview.schedule');
		const { url } = getRequestEvent();

		await interviewService.cancel(interviewId, applicationId, organizationId, user.id, url.origin);

		await getApplication({ orgSlug, applicationId }).refresh();
		return { cancelled: true };
	}
);

/* ---------------------------------------------------------------------------
   Offers
   --------------------------------------------------------------------------- */

export const draftOffer = command(
	v.object({
		orgSlug: v.string(),
		applicationId: uuid,
		salaryAmount: v.pipe(v.number(), v.integer(), v.minValue(1, 'An offer needs a salary.')),
		salaryCurrency: v.optional(v.pipe(v.string(), v.length(3))),
		salaryPeriod: v.optional(v.picklist(['hour', 'day', 'month', 'year'])),
		extras: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2000))),
		startDate: v.optional(v.pipe(v.string(), v.isoTimestamp())),
		expiresAt: v.optional(v.pipe(v.string(), v.isoTimestamp()))
	}),
	async ({ orgSlug, applicationId, startDate, expiresAt, ...rest }) => {
		const { organizationId, user } = await requirePermission(orgSlug, 'offer.create');

		await offerService.draft({
			...rest,
			applicationId,
			organizationId,
			actorUserId: user.id,
			startDate: startDate ? new Date(startDate) : null,
			expiresAt: expiresAt ? new Date(expiresAt) : null
		});

		await getApplication({ orgSlug, applicationId }).refresh();
		return { drafted: true };
	}
);

export const changeOfferStatus = command(
	v.object({
		orgSlug: v.string(),
		applicationId: uuid,
		offerId: uuid,
		status: v.picklist(['sent', 'accepted', 'declined', 'withdrawn'])
	}),
	async ({ orgSlug, applicationId, offerId, status }) => {
		// Sending an offer is `offer.approve`, not `offer.create`. Drafting one is a
		// suggestion; putting a number in front of a candidate is a commitment, and
		// the roles that may do each are deliberately different.
		const permission = status === 'sent' ? 'offer.approve' : 'offer.create';
		const { organizationId, user } = await requirePermission(orgSlug, permission);
		const { url } = getRequestEvent();

		await offerService.changeStatus(
			offerId,
			applicationId,
			organizationId,
			user.id,
			status,
			url.origin
		);

		await getApplication({ orgSlug, applicationId }).refresh();
		return { status };
	}
);
