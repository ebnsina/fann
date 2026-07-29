import { formatAddress, toAddressList, type EmailDriver, type EmailMessage } from './types';

/**
 * Development driver. Prints the message to stdout instead of sending it.
 *
 * Verification links and password resets are printed in full so local signup
 * flows work without a mail provider — which also means this driver must never
 * be selected in production.
 */
export function createLogDriver(from: string): EmailDriver {
	return {
		name: 'log',

		async send(message: EmailMessage) {
			const recipients = toAddressList(message.to).map(formatAddress).join(', ');

			console.info(
				[
					'',
					'┌─ email ────────────────────────────────────────────────',
					`│ from:    ${from}`,
					`│ to:      ${recipients}`,
					`│ subject: ${message.subject}`,
					`│ tag:     ${message.tag}`,
					'├────────────────────────────────────────────────────────',
					message.text
						.split('\n')
						.map((line) => `│ ${line}`)
						.join('\n'),
					'└────────────────────────────────────────────────────────',
					''
				].join('\n')
			);

			return { id: null };
		}
	};
}
