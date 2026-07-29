import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

/**
 * Every secret and setting the app reads is declared here, so SvelteKit validates
 * it at boot rather than at the first request that happens to need it. Add the
 * variable here in the same commit that introduces the code using it.
 *
 * **Nothing here may fall back to a working value.** A missing variable must stop
 * the process on the first line, with the variable's name in the message. The
 * failure mode a default protects you from — an app that starts — is worse than
 * the one it creates: a signing secret that is the same string in every
 * deployment, or an upload scanner that silently approves everything, is not
 * discovered until it matters.
 *
 * The only optional entries below are those that are meaningless unless another
 * variable selects them (the S3 credentials, the Resend key). Those are checked
 * where the driver is constructed, so choosing `s3` without a bucket still fails
 * at start-up rather than at the first upload.
 */
export const variables = defineEnvVars({
	NODE_ENV: {
		description:
			'The run mode. Decides whether cookies are marked `Secure`, so it is read rather than guessed — a wrong guess in production means session cookies travel over plain HTTP. Set it explicitly when running the built server: NODE_ENV=production node build.',
		schema: v.picklist(['development', 'production', 'test'])
	},

	DATABASE_URL: {
		description: 'The database connection string.',
		schema: v.pipe(v.string(), v.nonEmpty())
	},

	// Storage — `local` writes under STORAGE_LOCAL_DIR, `s3` uses the S3_* vars.
	STORAGE_DRIVER: {
		description: "Storage driver: 'local' (development) or 's3' (production).",
		schema: v.picklist(['local', 's3'])
	},
	STORAGE_LOCAL_DIR: {
		description: 'Directory for the local storage driver. Must be outside static/.',
		schema: v.pipe(v.string(), v.nonEmpty())
	},
	STORAGE_SIGNING_SECRET: {
		description:
			'HMAC secret for signing file download URLs. Generate with `openssl rand -base64 48`. Must differ per deployment — a shared value lets a link signed anywhere be replayed everywhere.',
		schema: v.pipe(
			v.string(),
			// 32 characters is the floor at which brute-forcing the HMAC key stops
			// being the cheapest attack on a download link.
			v.minLength(32, 'STORAGE_SIGNING_SECRET must be at least 32 characters.')
		)
	},

	// S3 — meaningless unless STORAGE_DRIVER is 's3'; checked at driver construction.
	S3_BUCKET: { description: 'S3 bucket name.', schema: v.optional(v.string(), '') },
	S3_REGION: { description: 'S3 region.', schema: v.optional(v.string(), '') },
	S3_ENDPOINT: {
		description: 'Custom S3 endpoint for R2/MinIO. Leave empty for AWS.',
		schema: v.optional(v.string(), '')
	},
	S3_ACCESS_KEY_ID: { description: 'S3 access key id.', schema: v.optional(v.string(), '') },
	S3_SECRET_ACCESS_KEY: {
		description: 'S3 secret access key.',
		schema: v.optional(v.string(), '')
	},

	// Email — `log` prints to stdout in development.
	EMAIL_DRIVER: {
		description: "Email driver: 'log' (development) or 'resend' (production).",
		schema: v.picklist(['log', 'resend'])
	},
	EMAIL_FROM: {
		description: 'From address for transactional email.',
		schema: v.pipe(v.string(), v.nonEmpty())
	},
	RESEND_API_KEY: {
		description: "Resend API key. Required when EMAIL_DRIVER is 'resend'.",
		schema: v.optional(v.string(), '')
	},

	/*
	 * AI — entirely optional.
	 *
	 * Every AI feature has a non-AI path, so an empty provider is a supported way
	 * to run this product rather than a broken configuration. That is why these are
	 * optional with empty defaults and not validated as a set: the check for "is a
	 * key actually present" belongs where the adapter is built, next to the code
	 * that has to tell somebody it is unavailable.
	 */
	AI_PROVIDER: {
		description:
			"Which model provider to use: 'anthropic', 'openai', or empty to turn every AI feature off. Off is a supported setting — each one has a path that does not need a model.",
		schema: v.optional(v.picklist(['', 'anthropic', 'openai']), '')
	},
	AI_MODEL: {
		description:
			'Model id. Leave empty for the provider default. Pinning it is what stops a provider silently changing what your team sees.',
		schema: v.optional(v.string(), '')
	},
	ANTHROPIC_API_KEY: {
		description: 'Required when AI_PROVIDER is "anthropic".',
		schema: v.optional(v.string(), '')
	},
	OPENAI_API_KEY: {
		description: 'Required when AI_PROVIDER is "openai".',
		schema: v.optional(v.string(), '')
	},

	CRON_SECRET: {
		description:
			'Shared secret for the scheduled-job endpoints (POST /internal/benchmarks). Generate with `openssl rand -base64 48`. These endpoints rewrite published figures, so an unguarded one is a way for anyone to make the market look however they like.',
		schema: v.pipe(v.string(), v.minLength(32, 'CRON_SECRET must be at least 32 characters.'))
	},
	// ClamAV — only read when FILE_SCANNER is "clamav", and checked where the
	// driver is constructed so a misconfiguration fails at boot rather than at the
	// first upload.
	CLAMAV_HOST: {
		description: 'Host of the clamd daemon. Required when FILE_SCANNER is "clamav".',
		schema: v.optional(v.string(), '')
	},
	CLAMAV_PORT: {
		description: "TCP port of the clamd daemon. Defaults to clamd's own 3310.",
		// Environment values arrive as strings, so the number is parsed rather than
		// declared — `v.number()` alone rejects "3310". The fallback is a string for
		// the same reason: it goes through the same pipe as a supplied value.
		schema: v.optional(
			v.pipe(
				v.string(),
				v.transform(Number),
				v.number('CLAMAV_PORT must be a number.'),
				v.integer('CLAMAV_PORT must be a whole number.')
			),
			'3310'
		)
	},
	CLAMAV_TIMEOUT_MS: {
		description:
			'How long to wait for a verdict before giving up. A timeout is recorded as a failed scan, never as a clean one.',
		schema: v.optional(
			v.pipe(
				v.string(),
				v.transform(Number),
				v.number('CLAMAV_TIMEOUT_MS must be a number.'),
				v.integer('CLAMAV_TIMEOUT_MS must be a whole number.')
			),
			'30000'
		)
	},

	FILE_SCANNER: {
		description:
			"Malware scanner for uploads: 'permissive' marks every file clean without looking at it and is for development only; 'clamav' scans. There is no default, because the safe choice and the convenient one are not the same and the decision must be made deliberately.",
		schema: v.picklist(['permissive', 'clamav'])
	}
});
