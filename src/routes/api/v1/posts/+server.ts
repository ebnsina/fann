import * as v from 'valibot';
import { and, eq, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '#lib/server/db';
import { companies } from '#lib/server/db/schema/company';
import * as social from '#lib/server/services/social';
import { apiInvalid, apiJson, readJson, requireApiKey } from '../auth';
import type { RequestHandler } from './$types';

/**
 * Post to the feed as this company.
 *
 * The reason this exists: a company that already announces things on its own
 * site, or through whatever posts to its social accounts, should be able to send
 * the same update here without a person opening a second tab to retype it.
 *
 * It posts **as the company**, and the author is the person who created the key.
 * `social.ts` keeps a user id on every post because "who actually said this" is
 * the first question when one goes wrong, and an integration does not excuse the
 * product from being able to answer it. A key whose creator has closed their
 * account cannot post at all, rather than posting with nobody's name on it.
 */
const createPostSchema = v.object({
	body: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty('Write something first.'),
		v.maxLength(5_000, 'That post is too long.')
	)
});

export const POST: RequestHandler = async ({ request }) => {
	const { organizationId, createdByUserId } = await requireApiKey(request);

	if (!createdByUserId) {
		error(403, 'The account that created this key has been closed. Issue a new key.');
	}

	const parsed = v.safeParse(createPostSchema, await readJson(request));
	if (!parsed.success) return apiInvalid(v.flatten(parsed.issues).nested ?? {});

	const [company] = await db
		.select({ id: companies.id })
		.from(companies)
		.where(and(eq(companies.organizationId, organizationId), isNull(companies.deletedAt)))
		.limit(1);

	if (!company) error(400, 'This organization has no company profile yet.');

	const post = await social.createPost({
		authorUserId: createdByUserId,
		companyId: company.id,
		body: parsed.output.body
	});

	return apiJson({ data: { id: post.id, createdAt: post.createdAt } }, { status: 201 });
};
