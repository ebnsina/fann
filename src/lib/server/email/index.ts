import { EMAIL_DRIVER, EMAIL_FROM, RESEND_API_KEY } from '$app/env/private';
import { createLogDriver } from './log';
import { createResendDriver } from './resend';
import type { EmailDriver } from './types';

export * from './types';

function createDriver(): EmailDriver {
	if (EMAIL_DRIVER === 'resend') {
		if (!RESEND_API_KEY) {
			throw new Error("EMAIL_DRIVER is 'resend' but RESEND_API_KEY is not set.");
		}
		return createResendDriver(RESEND_API_KEY, EMAIL_FROM);
	}

	return createLogDriver(EMAIL_FROM);
}

export const email: EmailDriver = createDriver();
