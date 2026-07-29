import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import { apply, timelineForCandidate } from './application';
import { addNote, deleteNote, internalTimeline, listNotes } from './note';

/** Unique per spec file, so cleanup cannot reach another suite's rows. */
const SUITE = 'notes';

describe.skipIf(!databaseReachable)('application notes', () => {
	let fixture: JobFixture;
	let organizationId: string;
	let recruiterId: string;
	let colleagueId: string;

	beforeAll(async () => {
		fixture = await createJobFixture(SUITE);
		organizationId = fixture.organizationId;
		recruiterId = (await createUser(SUITE)).id;
		colleagueId = (await createUser(SUITE)).id;
	});

	afterAll(async () => {
		await fixture.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	async function freshApplication(): Promise<string> {
		const userId = (await createUser(SUITE)).id;
		const application = await apply({ jobId: fixture.jobId, userId });
		return application.id;
	}

	it('keeps notes out of the candidate timeline', async () => {
		const userId = (await createUser(SUITE)).id;
		const application = await apply({ jobId: fixture.jobId, userId });

		await addNote(application.id, organizationId, recruiterId, 'Too junior for this one.');

		// The employer sees the note was left; the candidate sees neither the note nor
		// the fact of it. This is the whole reason notes are a separate table.
		const internal = await internalTimeline(application.id, organizationId);
		expect(internal.some((event) => event.type === 'note_added')).toBe(true);

		const candidateView = await timelineForCandidate(application.id, userId);
		expect(candidateView.some((event) => event.type === 'note_added')).toBe(false);

		// And nothing anywhere in what the candidate can read contains the words.
		expect(JSON.stringify(candidateView)).not.toContain('Too junior');
	});

	it('refuses an application belonging to another organization', async () => {
		const other = await createJobFixture(`${SUITE}-other`);
		const userId = (await createUser(SUITE)).id;
		const application = await apply({ jobId: other.jobId, userId });

		// Membership of *an* organization is not membership of the one that received
		// this application — without this check any recruiter could read any
		// candidate's notes by guessing an id.
		await expect(listNotes(application.id, organizationId)).rejects.toThrow();
		await expect(
			addNote(application.id, organizationId, recruiterId, 'Should not land.')
		).rejects.toThrow();

		await other.cleanup();
	});

	it('lets an author delete their own note and nobody else', async () => {
		const applicationId = await freshApplication();
		const note = await addNote(applicationId, organizationId, recruiterId, 'Mine.');

		await expect(deleteNote(note.id, applicationId, organizationId, colleagueId)).rejects.toThrow();

		// Still there after the refused attempt.
		expect(await listNotes(applicationId, organizationId)).toHaveLength(1);

		await deleteNote(note.id, applicationId, organizationId, recruiterId);
		expect(await listNotes(applicationId, organizationId)).toHaveLength(0);
	});

	it('soft-deletes, so the history of the decision survives', async () => {
		const applicationId = await freshApplication();
		const note = await addNote(applicationId, organizationId, recruiterId, 'Reconsidered.');
		await deleteNote(note.id, applicationId, organizationId, recruiterId);

		// The note is gone from the list, but the event saying one was left remains —
		// a decision with an unexplained gap before it is hard to account for later.
		const internal = await internalTimeline(applicationId, organizationId);
		expect(internal.some((event) => event.type === 'note_added')).toBe(true);
	});

	it('returns notes newest first, with their author', async () => {
		const applicationId = await freshApplication();
		await addNote(applicationId, organizationId, recruiterId, 'First.');
		await addNote(applicationId, organizationId, colleagueId, 'Second.');

		const notes = await listNotes(applicationId, organizationId);

		expect(notes.map((note) => note.body)).toEqual(['Second.', 'First.']);
		expect(notes[0].author?.id).toBe(colleagueId);
	});
});
