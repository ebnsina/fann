import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { companies } from '../db/schema/company';
import { organizations, orgMembers, type OrgRole } from '../db/schema/org';
import { uniqueSlug } from '../slug';

export interface CreateOrganizationInput {
	name: string;
	ownerUserId: string;
	/** Optional company domain, used later for the verified-employer badge. */
	domain?: string | null;
}

export interface OrganizationSummary {
	id: string;
	name: string;
	slug: string;
	role: OrgRole;
}

/**
 * Create an organization, its public company profile, and the owner membership.
 *
 * All three in one transaction: an organization with no owner is unreachable, and
 * one with no company profile breaks every public link to it. Partial success here
 * would need manual repair.
 */
export async function createOrganization(
	input: CreateOrganizationInput
): Promise<OrganizationSummary> {
	const slug = await uniqueSlug(input.name, async (candidate) => {
		const [existing] = await db
			.select({ id: organizations.id })
			.from(organizations)
			.where(eq(organizations.slug, candidate))
			.limit(1);
		return Boolean(existing);
	});

	return db.transaction(async (tx) => {
		const [organization] = await tx
			.insert(organizations)
			.values({ name: input.name, slug, domain: input.domain ?? null })
			.returning();

		await tx.insert(orgMembers).values({
			organizationId: organization.id,
			userId: input.ownerUserId,
			role: 'owner'
		});

		// The company profile shares the organization's slug on creation. They can
		// diverge later — renaming the public profile must not break `/hire/<slug>`.
		await tx.insert(companies).values({
			organizationId: organization.id,
			name: input.name,
			slug
		});

		return { id: organization.id, name: organization.name, slug: organization.slug, role: 'owner' };
	});
}

/** Organizations the user belongs to, for the switcher and post-login routing. */
export async function listForUser(userId: string): Promise<OrganizationSummary[]> {
	return db
		.select({
			id: organizations.id,
			name: organizations.name,
			slug: organizations.slug,
			role: orgMembers.role
		})
		.from(orgMembers)
		.innerJoin(organizations, eq(orgMembers.organizationId, organizations.id))
		.where(and(eq(orgMembers.userId, userId), isNull(organizations.deletedAt)));
}
