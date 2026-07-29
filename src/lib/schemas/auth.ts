import * as v from 'valibot';

/**
 * Auth input schemas, shared between the server (`form(schema, …)`) and the client
 * (`form.preflight(schema)`).
 *
 * They live here rather than in the `.remote.ts` file because remote modules cannot
 * export anything but remote functions — and because one definition means the
 * validation a user sees while typing is the validation the server enforces.
 */

/** Emails are compared lowercase, so they are normalized before validation. */
export const emailField = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.nonEmpty('Enter your email address.'),
	v.email('That does not look like an email address.'),
	v.maxLength(254, 'That email address is too long.')
);

/**
 * 12 characters minimum with no composition rules.
 *
 * Length beats character-class requirements — those push people towards
 * `Password1!` — and the breach check in `password.ts` catches the passwords that
 * actually get credential-stuffed.
 */
export const passwordField = v.pipe(
	v.string(),
	v.minLength(12, 'Use at least 12 characters.'),
	v.maxLength(200, 'That password is too long.')
);

export const nameField = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty('Enter your name.'),
	v.maxLength(120, 'That name is too long.')
);

export const signupSchema = v.object({
	name: nameField,
	email: emailField,
	// The leading underscore keeps the value from being echoed back to the browser
	// if the submission fails without JavaScript.
	_password: passwordField
});

export const loginSchema = v.object({
	email: emailField,
	_password: v.pipe(v.string(), v.nonEmpty('Enter your password.'))
});

export const requestPasswordResetSchema = v.object({ email: emailField });

export const resetPasswordSchema = v.object({
	token: v.pipe(v.string(), v.nonEmpty()),
	_password: passwordField
});

export type SignupInput = v.InferOutput<typeof signupSchema>;
export type LoginInput = v.InferOutput<typeof loginSchema>;
