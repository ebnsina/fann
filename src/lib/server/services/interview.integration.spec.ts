import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import { apply, timelineForCandidate } from './application';
import { cancel, listForApplication, schedule, toCalendar } from './interview';

/** Unique per spec file, so cleanup cannot reach another suite's rows. */
const SUITE = 'interview';

describe.skipIf(!databaseReachable)('interviews', () => {
	let fixture: JobFixture;
	let organizationId: string;
	let actorId: string;

	const soon = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

	beforeAll(async () => {
		fixture = await createJobFixture(SUITE);
		organizationId = fixture.organizationId;
		actorId = (await createUser(SUITE)).id;
	});

	afterAll(async () => {
		await fixture.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	async function freshApplication(): Promise<{ applicationId: string; candidateId: string }> {
		const candidateId = (await createUser(SUITE)).id;
		const application = await apply({ jobId: fixture.jobId, userId: candidateId });
		return { applicationId: application.id, candidateId };
	}

	function baseInput(applicationId: string) {
		return {
			applicationId,
			organizationId,
			actorUserId: actorId,
			title: 'First conversation',
			mode: 'video' as const,
			startsAt: soon(),
			durationMinutes: 45,
			participantUserIds: [actorId]
		};
	}

	it('tells the candidate when one is booked', async () => {
		const { applicationId, candidateId } = await freshApplication();
		await schedule(baseInput(applicationId));

		// An interview the candidate was not told about is a diary entry, not an
		// interview.
		const timeline = await timelineForCandidate(applicationId, candidateId);
		expect(timeline.some((event) => event.type === 'interview_scheduled')).toBe(true);
	});

	it('refuses a time that has already passed', async () => {
		const { applicationId } = await freshApplication();

		await expect(
			schedule({ ...baseInput(applicationId), startsAt: new Date(Date.now() - 60_000) })
		).rejects.toThrow();
	});

	it('refuses an absurd duration', async () => {
		const { applicationId } = await freshApplication();

		await expect(schedule({ ...baseInput(applicationId), durationMinutes: 2 })).rejects.toThrow();
		await expect(
			schedule({ ...baseInput(applicationId), durationMinutes: 1000 })
		).rejects.toThrow();
	});

	it('cancels rather than deletes', async () => {
		const { applicationId, candidateId } = await freshApplication();
		const interview = await schedule(baseInput(applicationId));

		await cancel(interview.id, applicationId, organizationId, actorId);

		const all = await listForApplication(applicationId, organizationId);
		const cancelled = all.find((row) => row.id === interview.id);

		// Still there, marked. Somebody who was told about an interview needs their
		// timeline to explain where it went.
		expect(cancelled).toBeDefined();
		expect(cancelled?.cancelledAt).not.toBeNull();

		const timeline = await timelineForCandidate(applicationId, candidateId);
		expect(timeline.filter((event) => event.type === 'interview_scheduled')).toHaveLength(2);
	});

	it('will not cancel the same interview twice', async () => {
		const { applicationId } = await freshApplication();
		const interview = await schedule(baseInput(applicationId));

		await cancel(interview.id, applicationId, organizationId, actorId);
		await expect(cancel(interview.id, applicationId, organizationId, actorId)).rejects.toThrow();
	});

	it('refuses an application belonging to another organization', async () => {
		const other = await createJobFixture(`${SUITE}-other`);
		const userId = (await createUser(SUITE)).id;
		const application = await apply({ jobId: other.jobId, userId });

		await expect(listForApplication(application.id, organizationId)).rejects.toThrow();

		await other.cleanup();
	});

	it('produces a calendar file that escapes its separators', async () => {
		const { applicationId } = await freshApplication();
		await schedule({
			...baseInput(applicationId),
			title: 'Systems, design; and a chat',
			location: 'Floor 3, Building B'
		});

		const [interview] = await listForApplication(applicationId, organizationId);
		const ics = toCalendar(interview, 'Fixture Co');

		expect(ics).toContain('BEGIN:VCALENDAR');
		expect(ics).toContain('END:VEVENT');
		// Commas and semicolons are field separators in iCalendar. Unescaped, a title
		// with one in it silently truncates the entry in the calendar app.
		expect(ics).toContain('SUMMARY:Systems\\, design\\; and a chat');
		expect(ics).toContain('LOCATION:Floor 3\\, Building B');
		// RFC 5545 requires CRLF, and some clients enforce it.
		expect(ics).toContain('\r\n');
	});
});
