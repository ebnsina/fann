import { and, eq, ne } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { companies, companySlugHistory, type Company } from '../db/schema/company';
import type { CompanyProfileInput } from '#lib/schemas/company';

/**
 * A company's own public profile.
 *
 * This did not exist until now: the row was written once inside
 * `organization.ts` at sign-up and never touched again, so a company could not
 * correct a typo in the name shown on its own page.
 *
 * The only genuinely awkward part is the slug. It is public, already linked from
 * every one of that company's job pages and from wherever anyone has shared it,
 * so a rename that simply overwrites it turns all of those into 404s with nothing
 * to explain the gap. `company_slug_history` is what makes renaming safe instead
 * of merely permitted.
 */

/** Empty string in a form means "not set", which is `null` in the row. */
function orNull(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

export async function forOrganization(organizationId: string): Promise<Company | null> {
	const [row] = await db
		.select()
		.from(companies)
		.where(eq(companies.organizationId, organizationId))
		.limit(1);

	return row ?? null;
}

/**
 * Resolve a slug, current or retired.
 *
 * Returns the company's *current* slug alongside it so the caller can redirect
 * rather than serve the same page at two addresses — two live URLs for one
 * company splits every share and every search result between them.
 */
export async function resolveSlug(
	slug: string
): Promise<{ companyId: string; currentSlug: string } | null> {
	const [current] = await db
		.select({ id: companies.id, slug: companies.slug })
		.from(companies)
		.where(eq(companies.slug, slug))
		.limit(1);

	if (current) return { companyId: current.id, currentSlug: current.slug };

	const [old] = await db
		.select({ companyId: companySlugHistory.companyId, currentSlug: companies.slug })
		.from(companySlugHistory)
		.innerJoin(companies, eq(companies.id, companySlugHistory.companyId))
		.where(eq(companySlugHistory.slug, slug))
		.limit(1);

	return old ?? null;
}

/**
 * Save the profile.
 *
 * The whole thing is one transaction because a rename is two writes — retiring
 * the old slug and taking the new one — and a half-applied rename leaves an
 * address that belongs to nobody.
 */
export async function updateProfile(
	organizationId: string,
	input: CompanyProfileInput
): Promise<Company> {
	const existing = await forOrganization(organizationId);
	if (!existing) error(404, 'Not found.');

	const slug = input.slug.trim().toLowerCase();

	return db.transaction(async (tx) => {
		if (slug !== existing.slug) {
			// Taken by another company, either as its current address or as one it
			// used to have. A retired slug stays claimed by its old owner — handing it
			// to somebody else would silently redirect their traffic.
			const [clash] = await tx
				.select({ id: companies.id })
				.from(companies)
				.where(and(eq(companies.slug, slug), ne(companies.id, existing.id)))
				.limit(1);

			const [historic] = await tx
				.select({ companyId: companySlugHistory.companyId })
				.from(companySlugHistory)
				.where(eq(companySlugHistory.slug, slug))
				.limit(1);

			if (clash || (historic && historic.companyId !== existing.id)) {
				error(400, 'That web address is already taken.');
			}

			// Keep the old one working. `onConflictDoNothing` because a company that
			// renames back and forth has seen this slug before.
			await tx
				.insert(companySlugHistory)
				.values({ companyId: existing.id, slug: existing.slug })
				.onConflictDoNothing();
		}

		const [row] = await tx
			.update(companies)
			.set({
				name: input.name.trim(),
				slug,
				tagline: orNull(input.tagline),
				about: orNull(input.about),
				websiteUrl: orNull(input.websiteUrl),
				// An empty select is "did not say", which the column stores as null —
				// passing an empty string would fail the enum.
				size: input.size ? input.size : null,
				foundedYear: input.foundedYear ? Number(input.foundedYear) : null
			})
			.where(eq(companies.id, existing.id))
			.returning();

		return row;
	});
}
