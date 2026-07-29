<script lang="ts">
	import Badge from '#lib/components/ui/Badge.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime } from '#lib/utils/format';
	import { searchUsers } from '../admin.remote';

	/**
	 * A search, never a browsable list.
	 *
	 * The useful shape of this is "this address wrote in". An endpoint that pages
	 * through every account is an export of the user table waiting to happen, so
	 * the service returns nothing at all for a term under two characters.
	 */
	let term = $state('');
	const rows = $derived(await searchUsers(term));
</script>

<svelte:head><title>People · Platform · Fann</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div class="flex flex-col gap-1">
			<h1 class="text-2xl text-text">People</h1>
			<p class="text-sm text-text-muted">
				Search by name or email, for answering a support question.
			</p>
		</div>
		<Input bind:value={term} placeholder="Name or email" class="w-64" />
	</div>

	{#if term.trim().length < 2}
		<EmptyState title="Search for someone" description="Type at least two characters.">
			{#snippet icon()}<Icon icon={icons.search} class="size-6" />{/snippet}
		</EmptyState>
	{:else if rows.length === 0}
		<EmptyState title="Nobody found" description="No account matches that.">
			{#snippet icon()}<Icon icon={icons.search} class="size-6" />{/snippet}
		</EmptyState>
	{:else}
		<div class="overflow-x-auto border border-border">
			<table class="w-full min-w-[44rem] text-sm">
				<thead class="border-b border-border bg-surface-raised text-left">
					<tr class="text-xs text-text-muted">
						<th class="p-3 font-medium">Person</th>
						<th class="p-3 font-medium">Joined</th>
						<th class="p-3 text-right font-medium">Companies</th>
						<th class="p-3 text-right font-medium">Applications</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.id)}
						<tr class="border-b border-border bg-surface last:border-b-0">
							<td class="p-3">
								<span class="flex flex-col gap-0.5">
									<span class="flex flex-wrap items-center gap-2">
										<span class="text-text">{row.name}</span>
										{#if !row.verified}<Badge>Unverified</Badge>{/if}
										{#if row.deactivated}<Badge>Closed</Badge>{/if}
										{#if row.platformAdmin}<Badge>Staff</Badge>{/if}
									</span>
									<span class="text-xs text-text-subtle">{row.email}</span>
								</span>
							</td>
							<td class="p-3 text-text-muted">{formatRelativeTime(row.joinedAt)}</td>
							<td class="p-3 text-right text-text-muted" data-numeric>{row.organizations}</td>
							<td class="p-3 text-right text-text-muted" data-numeric>{row.applications}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<p class="text-xs text-text-subtle">
		Read only. There is no way to edit an account, sign in as somebody, or grant staff access from
		here — the last one is the first thing an attacker with a stolen session looks for.
	</p>
</div>
