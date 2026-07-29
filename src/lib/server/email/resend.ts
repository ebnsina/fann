import { formatAddress, toAddressList, type EmailDriver, type EmailMessage } from './types';

/**
 * Production driver, over Resend's HTTP API.
 *
 * Called directly with `fetch` rather than via the `resend` SDK — the API surface
 * we use is one POST, and this keeps a dependency out of the server bundle.
 */
export function createResendDriver(apiKey: string, from: string): EmailDriver {
	return {
		name: 'resend',

		async send(message: EmailMessage) {
			const response = await fetch('https://api.resend.com/emails', {
				method: 'POST',
				headers: {
					authorization: `Bearer ${apiKey}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					from,
					to: toAddressList(message.to).map(formatAddress),
					subject: message.subject,
					text: message.text,
					html: message.html,
					reply_to: message.replyTo ? formatAddress(message.replyTo) : undefined,
					tags: [{ name: 'type', value: message.tag }]
				})
			});

			if (!response.ok) {
				// The body carries the provider's reason; the caller logs and retries.
				const detail = await response.text().catch(() => '');
				throw new Error(`Resend rejected the message (${response.status}): ${detail}`);
			}

			const body = (await response.json()) as { id?: string };
			return { id: body.id ?? null };
		}
	};
}
