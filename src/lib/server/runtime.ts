import { NODE_ENV } from '$app/env/private';

/**
 * What mode the server is running in.
 *
 * One place, reading the variable declared and validated in `src/env.ts`, rather
 * than `process.env.NODE_ENV === 'production'` written out wherever it is needed.
 * That comparison is silently false when the variable is unset or misspelled, and
 * everything it guards — `Secure` on the session cookie, the warning about the
 * no-op virus scanner — fails towards the insecure side when it is.
 */
export const isProduction = NODE_ENV === 'production';
export const isTest = NODE_ENV === 'test';

/**
 * Whether cookies should be marked `Secure`.
 *
 * Named for the decision rather than the environment, so a caller does not have
 * to know that "production" is the thing that implies HTTPS.
 */
export const secureCookies = isProduction;
