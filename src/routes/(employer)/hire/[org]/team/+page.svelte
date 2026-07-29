<script lang="ts">
	import { page } from '$app/state';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import FormActions from '#lib/components/ui/FormActions.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Table from '#lib/components/ui/Table.svelte';
	import PageSkeleton from '#lib/components/app/PageSkeleton.svelte';
	import Skeleton from '#lib/components/ui/Skeleton.svelte';
	import Td from '#lib/components/ui/Td.svelte';
	import Th from '#lib/components/ui/Th.svelte';
	import { toast } from '#lib/components/ui/toast.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime, label } from '#lib/utils/format';
	import { changeRole, getTeam, inviteMember, removeMember, revokeInvite } from '../team.remote';

	const orgSlug = $derived(page.params.org ?? '');
	const data = $derived(await getTeam({ orgSlug }));

	const canInvite = $derived(['owner', 'admin', 'recruiter'].includes(data.role));
	const canManage = $derived(['owner', 'admin'].includes(data.role));

	/**
	 * What each role is for, in the words a person choosing one would use.
	 *
	 * The permission table is the truth, but nobody reads a permission table while
	 * inviting a colleague. These are the same distinctions, said out loud.
	 */
	const ROLE_OPTIONS = [
		{ value: 'owner', label: 'Owner — everything, including billing' },
		{ value: 'admin', label: 'Admin — everything except deleting the company' },
		{ value: 'recruiter', label: 'Recruiter — posts jobs and runs the process' },
		{ value: 'hiring_manager', label: 'Hiring manager — decides on their own roles' },
		{ value: 'interviewer', label: 'Interviewer — sees their candidates, leaves notes' },
		{ value: 'viewer', label: 'Viewer — reads, changes nothing' }
	];

	let working = $state(false);

	/* Inviting -------------------------------------------------------------- */

	let inviting = $state(false);
	let inviteEmail = $state('');
	let inviteRole = $state('recruiter');

	async function submitInvite() {
		working = true;
		try {
			await inviteMember({ orgSlug, email: inviteEmail, role: inviteRole as never });
			inviting = false;
			inviteEmail = '';
			toast.success('Invitation sent.');
		} catch (failure) {
			toast.error(failure instanceof Error ? failure.message : 'Could not send that invitation.');
		} finally {
			working = false;
		}
	}

	/* Roles and removal ----------------------------------------------------- */

	async function setRole(userId: string, role: string) {
		working = true;
		try {
			await changeRole({ orgSlug, userId, role: role as never });
			toast.success('Role updated.');
		} catch (failure) {
			// The service refuses to demote the last owner. Saying so is more useful
			// than a generic failure, so the message comes straight through.
			toast.error(failure instanceof Error ? failure.message : 'Could not change that role.');
		} finally {
			working = false;
		}
	}

	let removingMember = $state<{ userId: string; name: string } | null>(null);
	let revoking = $state<{ id: string; email: string } | null>(null);

	async function confirmRemoveMember() {
		if (!removingMember) return;
		working = true;
		try {
			await removeMember({ orgSlug, userId: removingMember.userId });
			removingMember = null;
			toast.success('Removed from the team.');
		} catch (failure) {
			toast.error(failure instanceof Error ? failure.message : 'Could not remove that person.');
		} finally {
			working = false;
		}
	}

	async function confirmRevoke() {
		if (!revoking) return;
		working = true;
		try {
			await revokeInvite({ orgSlug, inviteId: revoking.id });
			revoking = null;
			toast.success('Invitation revoked.');
		} catch (failure) {
			toast.error(failure instanceof Error ? failure.message : 'Could not revoke that invitation.');
		} finally {
			working = false;
		}
	}
</script>

<svelte:head><title>Team · Fann</title></svelte:head>

<svelte:boundary>
	{#snippet pending()}
		<PageSkeleton>
			<div class="flex flex-col gap-px">
				{#each { length: 4 }, row (row)}
					<Skeleton height="3.25rem" />
				{/each}
			</div>
		</PageSkeleton>
	{/snippet}

	<div class="flex flex-col gap-8 p-(--fann-space-page)">
		<div class="flex flex-wrap items-end justify-between gap-4">
			<div class="flex flex-col gap-1">
				<h1 class="text-2xl text-text">Team</h1>
				<p class="text-sm text-text-muted">
					Who can see your candidates, and what each of them is allowed to do.
				</p>
			</div>

			{#if canInvite}
				<Button variant="primary" onclick={() => (inviting = true)}>
					<Icon icon={icons.invite} class="size-3.5" />
					Invite someone
				</Button>
			{/if}
		</div>

		<section class="flex flex-col gap-3">
			<h2 class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Members</h2>

			<Table label="People on this hiring team">
				{#snippet head()}
					<tr>
						<Th>Person</Th>
						<Th>Role</Th>
						<Th align="right">Joined</Th>
						<Th align="right"><span class="sr-only">Actions</span></Th>
					</tr>
				{/snippet}

				{#each data.members as member (member.userId)}
					<tr class="hover:bg-surface-hover">
						<Td>
							<div class="flex flex-col gap-0.5">
								<span class="text-sm font-medium text-text">
									{member.name}
									{#if member.userId === data.currentUserId}
										<span class="text-xs font-normal text-text-subtle">(you)</span>
									{/if}
								</span>
								<span class="text-xs text-text-subtle">{member.email}</span>
							</div>
						</Td>
						<Td>
							{#if canManage}
								<Select
									value={member.role}
									items={ROLE_OPTIONS}
									size="sm"
									class="w-64"
									disabled={working}
									onValueChange={(role: string) => setRole(member.userId, role)}
								/>
							{:else}
								<Badge>{label(member.role)}</Badge>
							{/if}
						</Td>
						<Td align="right" class="text-text-muted">{formatRelativeTime(member.joinedAt)}</Td>
						<Td align="right">
							{#if canManage && member.userId !== data.currentUserId}
								<button
									type="button"
									class="text-xs text-text-subtle underline-offset-2 hover:text-danger hover:underline"
									onclick={() => (removingMember = { userId: member.userId, name: member.name })}
								>
									Remove
								</button>
							{/if}
						</Td>
					</tr>
				{/each}
			</Table>
		</section>

		{#if data.invites.length > 0}
			<section class="flex flex-col gap-3">
				<h2 class="text-2xs font-medium tracking-wide text-text-subtle uppercase">
					Invited, not yet joined
				</h2>

				<Table label="Outstanding invitations">
					{#snippet head()}
						<tr>
							<Th>Email</Th>
							<Th>Role</Th>
							<Th>Invited by</Th>
							<Th align="right">Expires</Th>
							<Th align="right"><span class="sr-only">Actions</span></Th>
						</tr>
					{/snippet}

					{#each data.invites as invite (invite.id)}
						<tr class="hover:bg-surface-hover">
							<Td class="text-text">{invite.email}</Td>
							<Td><Badge>{label(invite.role)}</Badge></Td>
							<Td class="text-text-muted">{invite.invitedBy ?? 'Someone who has left'}</Td>
							<Td align="right" class="text-text-muted">
								{formatRelativeTime(invite.expiresAt)}
							</Td>
							<Td align="right">
								{#if canInvite}
									<button
										type="button"
										class="text-xs text-text-subtle underline-offset-2 hover:text-danger hover:underline"
										onclick={() => (revoking = { id: invite.id, email: invite.email })}
									>
										Revoke
									</button>
								{/if}
							</Td>
						</tr>
					{/each}
				</Table>
			</section>
		{/if}
	</div>
</svelte:boundary>

<!-- Invite ----------------------------------------------------------------- -->
<Dialog
	bind:open={inviting}
	title="Invite someone"
	description="They get an emailed link that expires in seven days. It only works for the address you send it to."
>
	<div class="flex flex-col gap-4">
		<Field label="Email">
			{#snippet children(control)}
				<Input
					{...control}
					bind:value={inviteEmail}
					type="email"
					autocomplete="off"
					placeholder="colleague@yourcompany.com"
				/>
			{/snippet}
		</Field>

		<Field label="Role" hint="You can change this later.">
			{#snippet children(control)}
				<Select {...control} bind:value={inviteRole} items={ROLE_OPTIONS} />
			{/snippet}
		</Field>
	</div>

	{#snippet footer()}
		<FormActions>
			{#snippet aside()}
				<Button variant="secondary" onclick={() => (inviting = false)}>Cancel</Button>
			{/snippet}
			<Button
				variant="primary"
				loading={working}
				disabled={inviteEmail.trim().length === 0}
				onclick={submitInvite}
			>
				Send invitation
			</Button>
		</FormActions>
	{/snippet}
</Dialog>

<ConfirmDialog
	open={removingMember !== null}
	title="Remove from the team?"
	description="They lose access to every candidate and job in this company immediately."
	detail="Notes they have already written stay, attributed to them. Nothing they did is erased."
	confirmPhrase={removingMember?.name}
	confirmLabel="Remove"
	loading={working}
	onconfirm={confirmRemoveMember}
	oncancel={() => (removingMember = null)}
/>

<ConfirmDialog
	open={revoking !== null}
	title="Revoke this invitation?"
	description="The link stops working. You can send a new one at any time."
	confirmLabel="Revoke"
	loading={working}
	onconfirm={confirmRevoke}
	oncancel={() => (revoking = null)}
/>
