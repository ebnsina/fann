import { db } from '../db';
import { emailLog } from '../db/schema/platform';
import { email as mailer, type EmailMessage } from '../email';

/**
 * Transactional notifications.
 *
 * Everything user-facing goes through `deliver`, which records the outcome in
 * `email_log`. That table is what turns "the candidate was notified" from a hope
 * into a fact somebody can check — and a silently failing provider is otherwise
 * indistinguishable from a working one.
 *
 * Delivery never throws. A mail outage must not roll back a rejection that the
 * employer already committed to; the log carries the failure so it can be retried.
 */

export interface DeliverInput extends EmailMessage {
	/** The recipient's account, when they have one. */
	userId?: string | null;
	entityType?: string;
	entityId?: string;
}

export async function deliver(input: DeliverInput): Promise<{ sent: boolean }> {
	const { userId, entityType, entityId, ...message } = input;
	const recipients = Array.isArray(message.to) ? message.to : [message.to];
	const toEmail = recipients.map((address) => address.email).join(', ');

	try {
		const result = await mailer.send(message);

		await db.insert(emailLog).values({
			userId: userId ?? null,
			toEmail,
			tag: message.tag,
			subject: message.subject,
			status: 'sent',
			providerMessageId: result.id,
			entityType: entityType ?? null,
			entityId: entityId ?? null
		});

		return { sent: true };
	} catch (cause) {
		await db.insert(emailLog).values({
			userId: userId ?? null,
			toEmail,
			tag: message.tag,
			subject: message.subject,
			status: 'failed',
			error: cause instanceof Error ? cause.message.slice(0, 1000) : String(cause).slice(0, 1000),
			entityType: entityType ?? null,
			entityId: entityId ?? null
		});

		console.error('Notification failed to send', { tag: message.tag, toEmail, cause });
		return { sent: false };
	}
}

export interface ApplicationRecipient {
	userId: string;
	name: string;
	email: string;
}

export interface ApplicationContext {
	applicationId: string;
	jobTitle: string;
	jobSlug: string;
	companyName: string;
	origin: string;
}

/** Confirmation that an application actually arrived. */
export async function notifyApplicationReceived(
	to: ApplicationRecipient,
	context: ApplicationContext
): Promise<void> {
	await deliver({
		userId: to.userId,
		to: { email: to.email, name: to.name },
		subject: `Application received — ${context.jobTitle} at ${context.companyName}`,
		tag: 'application.received',
		entityType: 'application',
		entityId: context.applicationId,
		text: [
			`Hi ${to.name},`,
			'',
			`${context.companyName} has your application for ${context.jobTitle}.`,
			'',
			'You can follow where it stands here:',
			`${context.origin}/me/applications`,
			'',
			'We will email you every time the status changes — including if the answer is no.'
		].join('\n')
	});
}

/**
 * Copy for each status the candidate can be moved to.
 *
 * Written as things a person would say. `rejected` is deliberately the longest
 * and the only one that carries a reason, because it is the message that
 * everywhere else in this industry simply never arrives.
 */
const STATUS_COPY: Record<string, { subject: (job: string) => string; body: string[] }> = {
	in_review: {
		subject: (job) => `Your application for ${job} is being reviewed`,
		body: ['Someone is reading your application now.']
	},
	interviewing: {
		subject: (job) => `You are moving to interviews for ${job}`,
		body: ['They would like to talk. Expect scheduling details shortly.']
	},
	offered: {
		subject: (job) => `You have an offer for ${job}`,
		body: ['An offer is on its way to you.']
	},
	hired: {
		subject: (job) => `You got the job — ${job}`,
		body: ['Congratulations. They will be in touch about next steps.']
	},
	rejected: {
		subject: (job) => `An update on your application for ${job}`,
		body: ['They have decided not to move forward this time.', '', 'Their reason:']
	}
};

export async function notifyApplicationStatusChanged(
	to: ApplicationRecipient,
	context: ApplicationContext & { status: string; reason?: string | null }
): Promise<void> {
	const copy = STATUS_COPY[context.status];
	// Not every status is worth an email — `withdrawn` is the candidate's own action.
	if (!copy) return;

	const lines = [
		`Hi ${to.name},`,
		'',
		`About your application for ${context.jobTitle} at ${context.companyName}:`,
		'',
		...copy.body
	];

	if (context.status === 'rejected' && context.reason) {
		lines.push('', context.reason);
	}

	lines.push(
		'',
		'Full history of this application:',
		`${context.origin}/me/applications`,
		'',
		`The job: ${context.origin}/jobs/${context.jobSlug}`
	);

	await deliver({
		userId: to.userId,
		to: { email: to.email, name: to.name },
		subject: copy.subject(context.jobTitle),
		tag: `application.${context.status}`,
		entityType: 'application',
		entityId: context.applicationId,
		text: lines.join('\n')
	});
}
