import { redirect } from '@sveltejs/kit';
import { form, getRequestEvent, query } from '$app/server';
import { createOrganizationSchema } from '#lib/schemas/organization';
import { requireVerifiedUser } from '#lib/server/auth/guards';
import { clearPendingCompanyName, readPendingCompanyName } from '#lib/server/auth/pending-company';
import * as organizations from '#lib/server/services/organization';

/** Organizations the signed-in user belongs to. Drives the switcher. */
export const myOrganizations = query(async () => {
	const { locals } = getRequestEvent();
	if (!locals.user) return [];
	return organizations.listForUser(locals.user.id);
});

/**
 * The company name someone typed on the join page, so the setup form can pre-fill
 * it rather than asking for it a second time after they confirm their email.
 */
export const pendingCompanyName = query(async () => readPendingCompanyName());

export const createOrganization = form(createOrganizationSchema, async ({ name, domain }) => {
	// Verified, not merely signed in: an organization is a public entity that can
	// post jobs, so we want a confirmed inbox behind it.
	const user = requireVerifiedUser();

	const organization = await organizations.createOrganization({
		ownerUserId: user.id,
		name,
		// Accept a pasted URL and keep just the host.
		domain: domain ? domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null
	});

	// The pre-fill has served its purpose; leaving it set would put an old name in
	// the form the next time someone adds a second company.
	clearPendingCompanyName();

	await myOrganizations().refresh();
	redirect(303, `/hire/${organization.slug}/jobs`);
});
