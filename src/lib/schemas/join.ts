import * as v from 'valibot';
import { emailField, nameField, passwordField } from './auth';
import { organizationNameField } from './organization';

/**
 * Sign-up from the company join page.
 *
 * Same three account fields as an ordinary sign-up, plus the company name. The
 * company itself is not created here: an organization can post public jobs, so we
 * want a confirmed email address behind it first. The name is carried across the
 * email-confirmation step and pre-filled on the setup screen, which saves the
 * person typing it twice for no reason.
 */
export const joinCompanySchema = v.object({
	name: nameField,
	email: emailField,
	// The leading underscore keeps the value from being echoed back to the browser
	// if the submission fails without JavaScript.
	_password: passwordField,
	company: organizationNameField
});

export type JoinCompanyInput = v.InferOutput<typeof joinCompanySchema>;
