import { randomBytes } from 'node:crypto';

/**
 * URL slugs.
 *
 * Slugs are public and permanent-ish, so they get their own module rather than
 * being reinvented per table with subtly different rules.
 */

/** Words that would collide with a route or read as something we control. */
const RESERVED = new Set([
	'admin',
	'api',
	'app',
	'auth',
	'dev',
	'fann',
	'help',
	'hire',
	'jobs',
	'login',
	'logout',
	'new',
	'reset',
	'settings',
	'signup',
	'support',
	'verify'
]);

export function slugify(input: string): string {
	return (
		input
			.normalize('NFKD')
			// Strip diacritics so "Zürich" becomes "zurich" rather than "zrich".
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 60)
			.replace(/-+$/, '')
	);
}

/** Short random suffix used to break ties. */
function suffix(): string {
	return randomBytes(3).toString('hex');
}

/**
 * Produce a slug that does not already exist.
 *
 * `isTaken` is injected rather than hardcoded to a table so companies, jobs and
 * organizations share one implementation. Falls back to a random string when the
 * input slugifies to nothing — a company named entirely in a non-Latin script
 * should still get a working URL rather than an error.
 */
export async function uniqueSlug(
	input: string,
	isTaken: (candidate: string) => Promise<boolean>
): Promise<string> {
	const base = slugify(input) || `x-${suffix()}`;

	// Reserved words are only a problem on their own; `admin-tools` is fine.
	let candidate = RESERVED.has(base) ? `${base}-${suffix()}` : base;

	// Bounded: after a few collisions the suffix is doing the work, and an
	// unbounded loop here would be a denial-of-service on repeated names.
	for (let attempt = 0; attempt < 5; attempt++) {
		if (!(await isTaken(candidate))) return candidate;
		candidate = `${base}-${suffix()}`;
	}

	return `${base}-${Date.now().toString(36)}`;
}

export function isReservedSlug(slug: string): boolean {
	return RESERVED.has(slug);
}
