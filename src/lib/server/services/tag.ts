import { and, asc, eq, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { applications } from '../db/schema/application';
import { applicationTags, tags, type Tag } from '../db/schema/ats';

/**
 * Labels an organization puts on applications.
 *
 * Deliberately not a second kind of stage. A stage says where someone is in the
 * process and changes what they are told; a tag says something the team wants to
 * remember — "referred", "reapply in a year", "needs a visa" — and the candidate
 * never sees it. Keeping the two apart is what stops a tag quietly acquiring the
 * power to reject somebody.
 */

async function assertOwned(applicationId: string, organizationId: string): Promise<void> {
	const [row] = await db
		.select({ id: applications.id })
		.from(applications)
		.where(and(eq(applications.id, applicationId), eq(applications.organizationId, organizationId)))
		.limit(1);

	if (!row) error(404, 'Not found.');
}

/** Every tag in the organization, with how many applications carry it. */
export async function listForOrg(
	organizationId: string
): Promise<(Tag & { usageCount: number })[]> {
	const rows = await db
		.select({
			id: tags.id,
			organizationId: tags.organizationId,
			name: tags.name,
			createdAt: tags.createdAt,
			updatedAt: tags.updatedAt,
			usageCount: sql<number>`count(${applicationTags.id})::int`
		})
		.from(tags)
		.leftJoin(applicationTags, eq(applicationTags.tagId, tags.id))
		.where(eq(tags.organizationId, organizationId))
		.groupBy(tags.id)
		.orderBy(asc(tags.name));

	return rows;
}

export async function listForApplication(
	applicationId: string,
	organizationId: string
): Promise<Tag[]> {
	await assertOwned(applicationId, organizationId);

	return db
		.select({
			id: tags.id,
			organizationId: tags.organizationId,
			name: tags.name,
			createdAt: tags.createdAt,
			updatedAt: tags.updatedAt
		})
		.from(applicationTags)
		.innerJoin(tags, eq(tags.id, applicationTags.tagId))
		.where(eq(applicationTags.applicationId, applicationId))
		.orderBy(asc(tags.name));
}

/**
 * Attach a tag by name, creating it if the organization has not used it before.
 *
 * By name rather than by id, because the interaction is typing a word. Names are
 * trimmed and collapsed so "Referred", "referred " and "referred" are one tag —
 * three near-identical labels is how a tag list stops being useful by week three.
 */
export async function attach(
	applicationId: string,
	organizationId: string,
	name: string
): Promise<Tag> {
	await assertOwned(applicationId, organizationId);

	const normalized = name.trim().replace(/\s+/g, ' ');
	if (!normalized) error(400, 'Give the tag a name.');

	const [tag] = await db
		.insert(tags)
		.values({ organizationId, name: normalized })
		// Racing two people tagging the same word at once should produce one tag, not
		// a constraint violation in front of whoever was second.
		.onConflictDoUpdate({
			target: [tags.organizationId, tags.name],
			set: { name: normalized }
		})
		.returning();

	await db.insert(applicationTags).values({ applicationId, tagId: tag.id }).onConflictDoNothing();

	return tag;
}

export async function detach(
	applicationId: string,
	organizationId: string,
	tagId: string
): Promise<void> {
	await assertOwned(applicationId, organizationId);

	await db
		.delete(applicationTags)
		.where(and(eq(applicationTags.applicationId, applicationId), eq(applicationTags.tagId, tagId)));
}

/**
 * Delete a tag everywhere.
 *
 * The rows on applications go with it, by cascade. There is no soft delete: a tag
 * is a label, not a decision, and nothing downstream needs to explain why one used
 * to exist.
 */
export async function remove(tagId: string, organizationId: string): Promise<void> {
	const deleted = await db
		.delete(tags)
		.where(and(eq(tags.id, tagId), eq(tags.organizationId, organizationId)))
		.returning({ id: tags.id });

	if (deleted.length === 0) error(404, 'Not found.');
}
