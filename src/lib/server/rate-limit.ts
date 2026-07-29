import { eq, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from './db';
import { rateLimits } from './db/schema/platform';

export interface RateLimitRule {
	/** Namespace for the counter, e.g. `login`. */
	action: string;
	/** Attempts allowed inside one window. */
	limit: number;
	windowMs: number;
}

export const RULES = {
	login: { action: 'login', limit: 10, windowMs: 15 * 60_000 },
	signup: { action: 'signup', limit: 5, windowMs: 60 * 60_000 },
	passwordReset: { action: 'password_reset', limit: 5, windowMs: 60 * 60_000 },
	emailVerification: { action: 'email_verification', limit: 5, windowMs: 60 * 60_000 },
	/** Applying is cheap for a person and cheaper to automate. */
	apply: { action: 'apply', limit: 30, windowMs: 60 * 60_000 },
	/**
	 * Reporting your pay.
	 *
	 * Deliberately tight. These figures are published, so a submission form is a
	 * way to move what the market appears to pay — an employer stuffing the low end
	 * or a candidate inflating it are the same attack. A person reports their own
	 * salary a handful of times a year, so five an hour costs nobody anything real.
	 */
	salaryReport: { action: 'salary_report', limit: 5, windowMs: 60 * 60_000 },
	/**
	 * Posting and commenting.
	 *
	 * Public the moment it lands, so the cost of getting this wrong is somebody
	 * else's feed. Thirty an hour is far more than a person writes and far less
	 * than a script would.
	 */
	post: { action: 'post', limit: 30, windowMs: 60 * 60_000 },
	/**
	 * Checking a domain's DNS.
	 *
	 * Reaches out to public resolvers on demand, and it is a button somebody will
	 * press repeatedly while waiting for a record to propagate. Twenty an hour is
	 * more than impatience needs and far less than an amplifier.
	 */
	domainCheck: { action: 'domain_check', limit: 20, windowMs: 60 * 60_000 },
	/**
	 * Asking a model for a draft.
	 *
	 * Every press costs tokens, and it is a button somebody will hit repeatedly
	 * while adjusting their notes. Per organization rather than per person, because
	 * the bill is the organization's.
	 */
	aiDraft: { action: 'ai_draft', limit: 20, windowMs: 60 * 60_000 }
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	retryAfterMs: number;
}

/**
 * Consume one unit against `<action>:<subject>`.
 *
 * A single statement so concurrent requests cannot both read a stale count and
 * write it back — the classic way a "limit 5" turns into 50 under load. The
 * `CASE` resets the window in the same round trip rather than deleting stale rows.
 */
export async function consume(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
	const key = `${rule.action}:${subject}`;

	// The cutoff is computed in SQL rather than passed as a JS `Date`. Two reasons:
	// a raw Date interpolated into a `sql` template bypasses the column's type
	// mapping and reaches the driver unserialized, and deriving the window from the
	// database clock removes any app/DB skew from the limit.
	const cutoff = sql`now() - make_interval(secs => ${rule.windowMs / 1000})`;

	const [row] = await db
		.insert(rateLimits)
		.values({ key, count: 1 })
		.onConflictDoUpdate({
			target: rateLimits.key,
			set: {
				count: sql`case when ${rateLimits.windowStartedAt} < ${cutoff} then 1 else ${rateLimits.count} + 1 end`,
				windowStartedAt: sql`case when ${rateLimits.windowStartedAt} < ${cutoff} then now() else ${rateLimits.windowStartedAt} end`
			}
		})
		.returning({ count: rateLimits.count, windowStartedAt: rateLimits.windowStartedAt });

	const elapsed = Date.now() - row.windowStartedAt.getTime();

	return {
		allowed: row.count <= rule.limit,
		remaining: Math.max(0, rule.limit - row.count),
		retryAfterMs: Math.max(0, rule.windowMs - elapsed)
	};
}

/**
 * Consume and throw 429 when exhausted.
 *
 * Limits are applied per IP *and* per identifier: IP alone lets a botnet spread a
 * credential-stuffing run across addresses, identifier alone lets one attacker lock
 * a victim out of their own account. Both together bound each without the other's
 * failure mode.
 */
export async function enforce(rule: RateLimitRule, subjects: string[]): Promise<void> {
	const results = await Promise.all(subjects.map((subject) => consume(rule, subject)));
	const blocked = results.find((result) => !result.allowed);

	if (blocked) {
		const minutes = Math.ceil(blocked.retryAfterMs / 60_000);
		error(429, `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
	}
}

/** Clear a counter after a legitimate success, so one bad guess costs nothing. */
export async function reset(rule: RateLimitRule, subject: string): Promise<void> {
	await db.delete(rateLimits).where(eq(rateLimits.key, `${rule.action}:${subject}`));
}
