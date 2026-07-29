export interface EmailAddress {
	email: string;
	name?: string;
}

export interface EmailMessage {
	to: EmailAddress | EmailAddress[];
	subject: string;
	/** Always required — a text part is what keeps mail out of spam folders. */
	text: string;
	html?: string;
	replyTo?: EmailAddress;
	/**
	 * Stable id for the kind of mail this is (`application.received`,
	 * `interview.invited`). Recorded in `email_log` so per-type delivery and
	 * unsubscribe preferences can be reasoned about.
	 */
	tag: string;
}

export interface SendResult {
	/** Provider message id, when the driver reports one. */
	id: string | null;
}

export interface EmailDriver {
	readonly name: 'log' | 'resend';
	send(message: EmailMessage): Promise<SendResult>;
}

export function formatAddress({ email, name }: EmailAddress): string {
	return name ? `${name} <${email}>` : email;
}

export function toAddressList(to: EmailAddress | EmailAddress[]): EmailAddress[] {
	return Array.isArray(to) ? to : [to];
}
