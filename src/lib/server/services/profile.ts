import { eq } from 'drizzle-orm';
import { db } from '../db';
import { candidateProfiles, type CandidateProfile } from '../db/schema/candidate';
import type { ProfileInput } from '#lib/schemas/profile';

/**
 * The candidate's own profile.
 *
 * Deliberately thin. The CV is the document an employer reads; this exists so a
 * person can say what they are looking for, and — the part that actually matters —
 * so `visibility` is something they set rather than something we assume. The
 * privacy page promises profiles are private until the person says otherwise, and
 * a promise with no control attached to it is just a sentence.
 */

/** Empty string in a form means "not set", which is `null` in the row. */
function orNull(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

export async function forUser(userId: string): Promise<CandidateProfile | null> {
	const [row] = await db
		.select()
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, userId))
		.limit(1);

	return row ?? null;
}

/**
 * Create or update the profile, in one statement.
 *
 * Upsert rather than read-then-write: two tabs saving at once would otherwise
 * race on the unique index and one of them would fail with a constraint error
 * rather than simply being the version that won.
 */
export async function save(userId: string, input: ProfileInput): Promise<CandidateProfile> {
	const values = {
		headline: orNull(input.headline),
		summary: orNull(input.summary),
		visibility: input.visibility,
		openToWork: input.openToWork,
		// An empty number box arrives as `undefined`; the column stores `null`.
		// Passing `undefined` to an update would silently leave the old value in
		// place, so clearing a field would appear to do nothing.
		desiredSalaryMin: input.desiredSalaryMin ?? null,
		desiredSalaryCurrency: input.desiredSalaryCurrency,
		workAuthorization: orNull(input.workAuthorization),
		noticePeriodDays: input.noticePeriodDays ?? null,
		websiteUrl: orNull(input.websiteUrl),
		linkedinUrl: orNull(input.linkedinUrl),
		githubUrl: orNull(input.githubUrl),
		updatedAt: new Date()
	};

	const [row] = await db
		.insert(candidateProfiles)
		.values({ userId, ...values })
		.onConflictDoUpdate({ target: candidateProfiles.userId, set: values })
		.returning();

	return row;
}
