import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { applicationEvents, applications } from '../db/schema/application';
import {
	interviewParticipants,
	interviews,
	type Interview,
	type InterviewMode
} from '../db/schema/ats';
import { companies } from '../db/schema/company';
import { users } from '../db/schema/identity';
import { jobs } from '../db/schema/job';
import { deliver } from '../notifications';

/**
 * Scheduled conversations with a candidate.
 *
 * Two things here are not conveniences:
 *
 *   1. **Scheduling tells the candidate.** An interview that exists only in the
 *      employer's calendar is how people end up waiting by a phone that never
 *      rings. Booking, moving and cancelling all email them, and all write a
 *      candidate-visible event.
 *   2. **Times are instants.** Stored with a zone, formatted per reader. "2pm"
 *      means nothing to someone three time zones away, and the calendar file has
 *      to agree with what both sides see on screen.
 */

export interface InterviewView {
	id: string;
	title: string;
	mode: InterviewMode;
	location: string | null;
	startsAt: Date;
	durationMinutes: number;
	notes: string | null;
	cancelledAt: Date | null;
	participants: { id: string; name: string }[];
}

async function assertOwned(applicationId: string, organizationId: string): Promise<void> {
	const [row] = await db
		.select({ id: applications.id })
		.from(applications)
		.where(and(eq(applications.id, applicationId), eq(applications.organizationId, organizationId)))
		.limit(1);

	if (!row) error(404, 'Not found.');
}

export async function listForApplication(
	applicationId: string,
	organizationId: string
): Promise<InterviewView[]> {
	await assertOwned(applicationId, organizationId);

	const rows = await db
		.select()
		.from(interviews)
		.where(eq(interviews.applicationId, applicationId))
		.orderBy(asc(interviews.startsAt));

	if (rows.length === 0) return [];

	// One query for the participants of every interview, not one per interview.
	const participants = await db
		.select({
			interviewId: interviewParticipants.interviewId,
			id: users.id,
			name: users.name
		})
		.from(interviewParticipants)
		.innerJoin(users, eq(users.id, interviewParticipants.userId))
		.where(
			inArray(
				interviewParticipants.interviewId,
				rows.map((row) => row.id)
			)
		);

	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		mode: row.mode,
		location: row.location,
		startsAt: row.startsAt,
		durationMinutes: row.durationMinutes,
		notes: row.notes,
		cancelledAt: row.cancelledAt,
		participants: participants
			.filter((participant) => participant.interviewId === row.id)
			.map(({ id, name }) => ({ id, name }))
	}));
}

export interface ScheduleInput {
	applicationId: string;
	organizationId: string;
	actorUserId: string;
	title: string;
	mode: InterviewMode;
	location?: string | null;
	startsAt: Date;
	durationMinutes: number;
	notes?: string | null;
	participantUserIds: string[];
	/** Base URL for links in the email. Omit to skip notifying. */
	origin?: string;
}

export async function schedule(input: ScheduleInput): Promise<Interview> {
	await assertOwned(input.applicationId, input.organizationId);

	// Scheduling something that has already happened is always a mistake, and one
	// that sends a confusing email if it goes through.
	if (input.startsAt.getTime() < Date.now()) {
		error(400, 'That time has already passed.');
	}

	if (input.durationMinutes < 5 || input.durationMinutes > 480) {
		error(400, 'An interview runs between 5 minutes and 8 hours.');
	}

	const interview = await db.transaction(async (tx) => {
		const [row] = await tx
			.insert(interviews)
			.values({
				applicationId: input.applicationId,
				title: input.title,
				mode: input.mode,
				location: input.location ?? null,
				startsAt: input.startsAt,
				durationMinutes: input.durationMinutes,
				notes: input.notes ?? null,
				createdByUserId: input.actorUserId
			})
			.returning();

		if (input.participantUserIds.length > 0) {
			await tx
				.insert(interviewParticipants)
				.values(input.participantUserIds.map((userId) => ({ interviewId: row.id, userId })))
				.onConflictDoNothing();
		}

		await tx.insert(applicationEvents).values({
			applicationId: input.applicationId,
			type: 'interview_scheduled',
			actorUserId: input.actorUserId,
			// The candidate sees this. An interview they were not told about is not an
			// interview, it is a diary entry.
			visibleToCandidate: true,
			payload: { title: input.title, startsAt: input.startsAt.toISOString(), mode: input.mode }
		});

		return row;
	});

	if (input.origin) await notify(interview, input.origin, 'scheduled');
	return interview;
}

export async function cancel(
	interviewId: string,
	applicationId: string,
	organizationId: string,
	actorUserId: string,
	origin?: string
): Promise<void> {
	await assertOwned(applicationId, organizationId);

	const [interview] = await db
		.select()
		.from(interviews)
		.where(
			and(
				eq(interviews.id, interviewId),
				eq(interviews.applicationId, applicationId),
				isNull(interviews.cancelledAt)
			)
		)
		.limit(1);

	if (!interview) error(404, 'Not found.');

	await db.transaction(async (tx) => {
		// Cancelled, not deleted. A candidate who was told about an interview needs
		// their timeline to explain where it went.
		await tx
			.update(interviews)
			.set({ cancelledAt: new Date() })
			.where(eq(interviews.id, interviewId));

		await tx.insert(applicationEvents).values({
			applicationId,
			type: 'interview_scheduled',
			actorUserId,
			visibleToCandidate: true,
			payload: { title: interview.title, cancelled: true }
		});
	});

	if (origin) await notify(interview, origin, 'cancelled');
}

/** Tell the candidate. Through `deliver`, so the attempt is recorded either way. */
async function notify(
	interview: Interview,
	origin: string,
	kind: 'scheduled' | 'cancelled'
): Promise<void> {
	const [context] = await db
		.select({
			userId: users.id,
			name: users.name,
			email: users.email,
			jobTitle: jobs.title,
			companyName: companies.name
		})
		.from(applications)
		.innerJoin(users, eq(users.id, applications.userId))
		.innerJoin(jobs, eq(jobs.id, applications.jobId))
		.innerJoin(companies, eq(companies.id, jobs.companyId))
		.where(eq(applications.id, interview.applicationId))
		.limit(1);

	if (!context) return;

	// Written out in the reader's own locale on the client is not possible in an
	// email, so it goes out in UTC with the offset spelled out. Ambiguity about
	// *when* is the one thing an interview invitation cannot afford.
	const when = interview.startsAt.toUTCString();

	await deliver({
		to: { email: context.email, name: context.name },
		userId: context.userId,
		entityType: 'interview',
		entityId: interview.id,
		tag: `interview.${kind}`,
		subject:
			kind === 'scheduled'
				? `Interview scheduled: ${context.jobTitle} at ${context.companyName}`
				: `Interview cancelled: ${context.jobTitle} at ${context.companyName}`,
		text:
			kind === 'scheduled'
				? [
						`Hi ${context.name},`,
						'',
						`${context.companyName} has scheduled an interview for the ${context.jobTitle} role.`,
						'',
						`What: ${interview.title}`,
						`When: ${when} (${interview.durationMinutes} minutes)`,
						interview.location ? `Where: ${interview.location}` : '',
						interview.notes ? '' : '',
						interview.notes ?? '',
						'',
						`Your application: ${origin}/me/applications`
					]
						.filter(Boolean)
						.join('\n')
				: [
						`Hi ${context.name},`,
						'',
						`${context.companyName} has cancelled the interview that was scheduled for ${when}.`,
						'',
						'They should be in touch about what happens next.',
						'',
						`Your application: ${origin}/me/applications`
					].join('\n')
	});
}

/**
 * The interview as an `.ics` file.
 *
 * Generated rather than pulled from a library: the format is a dozen lines, and a
 * dependency that renders it would still need every one of the escapes below
 * getting right.
 */
export function toCalendar(interview: InterviewView, organizerName: string): string {
	const stamp = (date: Date) =>
		date
			.toISOString()
			.replace(/[-:]/g, '')
			.replace(/\.\d{3}/, '');
	const ends = new Date(interview.startsAt.getTime() + interview.durationMinutes * 60_000);

	// Commas, semicolons and newlines are field separators in iCalendar. A job title
	// with a comma in it silently truncates the entry otherwise.
	const escape = (value: string) =>
		value
			.replace(/\\/g, '\\\\')
			.replace(/[,;]/g, (match) => `\\${match}`)
			.replace(/\n/g, '\\n');

	return (
		[
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Fann//Interview//EN',
			'CALSCALE:GREGORIAN',
			'METHOD:PUBLISH',
			'BEGIN:VEVENT',
			`UID:${interview.id}@fann`,
			`DTSTAMP:${stamp(new Date())}`,
			`DTSTART:${stamp(interview.startsAt)}`,
			`DTEND:${stamp(ends)}`,
			`SUMMARY:${escape(interview.title)}`,
			interview.location ? `LOCATION:${escape(interview.location)}` : '',
			interview.notes ? `DESCRIPTION:${escape(interview.notes)}` : '',
			`ORGANIZER;CN=${escape(organizerName)}:mailto:noreply@fann`,
			interview.cancelledAt ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
			'END:VEVENT',
			'END:VCALENDAR'
		]
			.filter(Boolean)
			// CRLF, not LF. RFC 5545 requires it and some calendar clients enforce it.
			.join('\r\n')
	);
}
