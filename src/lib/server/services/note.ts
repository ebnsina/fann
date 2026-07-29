import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { applicationEvents, applications } from '../db/schema/application';
import { applicationNotes } from '../db/schema/ats';
import { users } from '../db/schema/identity';

/**
 * Internal notes on an application.
 *
 * Nothing here is ever shown to the candidate. That is the point: a team needs
 * somewhere to disagree with itself about a decision, and a note written under
 * the assumption of privacy that later turns out to be public is how people learn
 * to stop writing anything useful down.
 *
 * What the candidate sees is the `application_events` timeline — a separate,
 * deliberate act of communication. The two must not be confused, which is why
 * they are different tables rather than one table with a flag somebody can flip.
 */

export interface NoteAuthor {
	id: string;
	name: string;
}

export interface ApplicationNoteView {
	id: string;
	body: string;
	createdAt: Date;
	author: NoteAuthor | null;
}

/**
 * Confirm this application belongs to the caller's organization.
 *
 * Every function below starts here. The remote layer has already checked that the
 * caller is a member of the org, but not that *this* application is one of theirs
 * — without this, any recruiter could read the notes on any candidate anywhere by
 * guessing an id.
 */
async function assertOwned(applicationId: string, organizationId: string): Promise<void> {
	const [row] = await db
		.select({ id: applications.id })
		.from(applications)
		.where(and(eq(applications.id, applicationId), eq(applications.organizationId, organizationId)))
		.limit(1);

	// `not_found`, not `forbidden`. Confirming an application exists tells the asker
	// that a particular person applied somewhere, which is the thing being protected.
	if (!row) error(404, 'Not found.');
}

export async function listNotes(
	applicationId: string,
	organizationId: string
): Promise<ApplicationNoteView[]> {
	await assertOwned(applicationId, organizationId);

	const rows = await db
		.select({
			id: applicationNotes.id,
			body: applicationNotes.body,
			createdAt: applicationNotes.createdAt,
			authorId: users.id,
			authorName: users.name
		})
		.from(applicationNotes)
		.leftJoin(users, eq(users.id, applicationNotes.authorUserId))
		.where(
			and(eq(applicationNotes.applicationId, applicationId), isNull(applicationNotes.deletedAt))
		)
		.orderBy(desc(applicationNotes.createdAt));

	return rows.map((row) => ({
		id: row.id,
		body: row.body,
		createdAt: row.createdAt,
		author: row.authorId ? { id: row.authorId, name: row.authorName ?? 'Someone' } : null
	}));
}

export async function addNote(
	applicationId: string,
	organizationId: string,
	authorUserId: string,
	body: string
): Promise<ApplicationNoteView> {
	await assertOwned(applicationId, organizationId);

	const [row] = await db.transaction(async (tx) => {
		const inserted = await tx
			.insert(applicationNotes)
			.values({ applicationId, authorUserId, body })
			.returning();

		// The timeline records *that* a note was left, never its contents, and not to
		// the candidate. It is there so the employer-side history of an application is
		// complete — a decision with an unexplained gap before it is hard to account
		// for six months later.
		await tx.insert(applicationEvents).values({
			applicationId,
			type: 'note_added',
			actorUserId: authorUserId,
			visibleToCandidate: false
		});

		return inserted;
	});

	const [author] = await db
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(eq(users.id, authorUserId))
		.limit(1);

	return {
		id: row.id,
		body: row.body,
		createdAt: row.createdAt,
		author: author ?? null
	};
}

/**
 * Soft-delete a note, and only your own.
 *
 * Soft, because a note that shaped a hiring decision is part of how that decision
 * can be explained afterwards. Only your own, because an admin quietly removing a
 * colleague's objection is precisely the failure an audit trail exists to prevent.
 */
export async function deleteNote(
	noteId: string,
	applicationId: string,
	organizationId: string,
	authorUserId: string
): Promise<void> {
	await assertOwned(applicationId, organizationId);

	const [note] = await db
		.select({ id: applicationNotes.id, authorUserId: applicationNotes.authorUserId })
		.from(applicationNotes)
		.where(
			and(
				eq(applicationNotes.id, noteId),
				eq(applicationNotes.applicationId, applicationId),
				isNull(applicationNotes.deletedAt)
			)
		)
		.limit(1);

	if (!note) error(404, 'Not found.');
	if (note.authorUserId !== authorUserId) error(403, 'You can only delete your own notes.');

	await db
		.update(applicationNotes)
		.set({ deletedAt: new Date() })
		.where(eq(applicationNotes.id, noteId));
}

/**
 * The full employer-side history — everything, including what the candidate is
 * not shown.
 *
 * The candidate's view of the same application comes from
 * `application.timelineForCandidate`, which filters to `visibleToCandidate`. Two
 * functions rather than a parameter, so a missing argument can never accidentally
 * widen what a candidate sees.
 */
export async function internalTimeline(applicationId: string, organizationId: string) {
	await assertOwned(applicationId, organizationId);

	return db
		.select({
			id: applicationEvents.id,
			type: applicationEvents.type,
			createdAt: applicationEvents.createdAt,
			payload: applicationEvents.payload,
			visibleToCandidate: applicationEvents.visibleToCandidate,
			actorName: users.name
		})
		.from(applicationEvents)
		.leftJoin(users, eq(users.id, applicationEvents.actorUserId))
		.where(eq(applicationEvents.applicationId, applicationId))
		.orderBy(asc(applicationEvents.createdAt));
}
