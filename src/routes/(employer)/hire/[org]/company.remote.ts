import * as v from 'valibot';
import { eq } from 'drizzle-orm';
import { command, form, query } from '$app/server';
import { requirePermission } from '#lib/server/auth/guards';
import { RULES, enforce } from '#lib/server/rate-limit';
import { db } from '#lib/server/db';
import { companies } from '#lib/server/db/schema/company';
import * as companyService from '#lib/server/services/company';
import * as verification from '#lib/server/services/verification';
import { companyProfileSchema } from '#lib/schemas/company';

/** The company's own settings: its public profile, and who may reply to it. */
export const companySettings = query(v.string(), async (orgSlug) => {
	const { organizationId } = await requirePermission(orgSlug, 'org.update');

	const [row] = await db
		.select({
			id: companies.id,
			name: companies.name,
			slug: companies.slug,
			tagline: companies.tagline,
			about: companies.about,
			websiteUrl: companies.websiteUrl,
			size: companies.size,
			foundedYear: companies.foundedYear,
			allowsInteraction: companies.allowsInteraction
		})
		.from(companies)
		.where(eq(companies.organizationId, organizationId))
		.limit(1);

	return row ?? null;
});

/**
 * Turn public replies on or off.
 *
 * Guarded on `org.update` rather than something posting-shaped: this decides
 * what happens under everything the company has ever published, which is a
 * setting about the company rather than about one post.
 */
export const setInteraction = command(
	v.object({ orgSlug: v.string(), allows: v.boolean() }),
	async ({ orgSlug, allows }) => {
		const { organizationId } = await requirePermission(orgSlug, 'org.update');

		await db
			.update(companies)
			.set({ allowsInteraction: allows })
			.where(eq(companies.organizationId, organizationId));

		await companySettings(orgSlug).refresh();
		return { allowsInteraction: allows };
	}
);

/**
 * Save the public profile.
 *
 * Guarded on `org.update`: this is the page every candidate reads before deciding
 * whether to apply, and changing the web address moves it.
 */
export const saveCompanyProfile = form(
	v.object({ orgSlug: v.string(), profile: companyProfileSchema }),
	async ({ orgSlug, profile }) => {
		const { organizationId } = await requirePermission(orgSlug, 'org.update');

		const company = await companyService.updateProfile(organizationId, profile);
		await companySettings(orgSlug).refresh();

		return { saved: true, slug: company.slug };
	}
);

/* -- Domain verification -------------------------------------------------- */

export const verificationState = query(v.string(), async (orgSlug) => {
	const { organizationId } = await requirePermission(orgSlug, 'org.update');
	return verification.stateFor(organizationId);
});

/** Claim a domain and mint the token that proves it. Drops any existing badge. */
export const claimDomain = command(
	v.object({ orgSlug: v.string(), domain: v.pipe(v.string(), v.trim(), v.maxLength(253)) }),
	async ({ orgSlug, domain }) => {
		const { organizationId } = await requirePermission(orgSlug, 'org.update');

		const state = await verification.claimDomain(organizationId, domain);
		await verificationState(orgSlug).refresh();

		return state;
	}
);

/**
 * Look for the record.
 *
 * Rate limited, because it reaches out to public DNS on demand and a button
 * somebody will press repeatedly while waiting for propagation is exactly the
 * shape of an accidental amplifier.
 */
export const checkDomain = command(v.string(), async (orgSlug) => {
	const { organizationId } = await requirePermission(orgSlug, 'org.update');

	await enforce(RULES.domainCheck, [`org:${organizationId}`]);

	const outcome = await verification.checkDomain(organizationId);
	await verificationState(orgSlug).refresh();

	return outcome;
});
