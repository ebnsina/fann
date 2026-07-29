import * as v from 'valibot';
import { command, getRequestEvent, query } from '$app/server';
import { requireOrgMember, requirePermission } from '#lib/server/auth/guards';
import * as team from '#lib/server/services/team';

/**
 * The hiring team.
 *
 * Reading the member list needs only membership — knowing who your colleagues
 * are is not privileged. Changing anything needs the matching permission, and the
 * service refuses the moves that would leave a company with no owner.
 */

const uuid = v.pipe(v.string(), v.uuid());

const role = v.picklist(['owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer', 'viewer']);

const email = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.nonEmpty('Enter an email address.'),
	v.email('That does not look like an email address.')
);

export const getTeam = query(v.object({ orgSlug: v.string() }), async ({ orgSlug }) => {
	const context = await requireOrgMember(orgSlug);

	const [members, invites] = await Promise.all([
		team.listMembers(context.organizationId),
		team.listInvites(context.organizationId)
	]);

	return { members, invites, role: context.role, currentUserId: context.user.id };
});

export const inviteMember = command(
	v.object({ orgSlug: v.string(), email, role }),
	async ({ orgSlug, email: address, role: invitedRole }) => {
		const context = await requirePermission(orgSlug, 'member.invite');
		const { url } = getRequestEvent();

		await team.invite(context.organizationId, context.user.id, address, invitedRole, url.origin);

		await getTeam({ orgSlug }).refresh();
		return { invited: true };
	}
);

export const revokeInvite = command(
	v.object({ orgSlug: v.string(), inviteId: uuid }),
	async ({ orgSlug, inviteId }) => {
		const context = await requirePermission(orgSlug, 'member.invite');
		await team.revokeInvite(inviteId, context.organizationId);

		await getTeam({ orgSlug }).refresh();
		return { revoked: true };
	}
);

export const changeRole = command(
	v.object({ orgSlug: v.string(), userId: uuid, role }),
	async ({ orgSlug, userId, role: nextRole }) => {
		const context = await requirePermission(orgSlug, 'member.update_role');
		await team.changeRole(context.organizationId, userId, nextRole);

		await getTeam({ orgSlug }).refresh();
		return { changed: true };
	}
);

export const removeMember = command(
	v.object({ orgSlug: v.string(), userId: uuid }),
	async ({ orgSlug, userId }) => {
		const context = await requirePermission(orgSlug, 'member.remove');
		await team.removeMember(context.organizationId, userId);

		await getTeam({ orgSlug }).refresh();
		return { removed: true };
	}
);
