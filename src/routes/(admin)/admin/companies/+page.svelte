<script lang="ts">
	import Badge from '#lib/components/ui/Badge.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime } from '#lib/utils/format';
	import { adminOrganizations } from '../admin.remote';

	let term = $state('');
	const rows = $derived(await adminOrganizations(term));
</script>

<svelte:head><title>Companies · Platform · Fann</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div class="flex flex-col gap-1">
			<h1 class="text-2xl text-text">Companies</h1>
			<p class="text-sm text-text-muted">
				Newest first. "Waiting" is people this company has not replied to, past the grace window.
			</p>
		</div>
		<Input bind:value={term} placeholder="Search by name or slug" class="w-64" />
	</div>

	{#if rows.length === 0}
		<EmptyState title="Nothing here" description="No company matches that.">
			{#snippet icon()}<Icon icon={icons.companies} class="size-6" />{/snippet}
		</EmptyState>
	{:else}
		<div class="overflow-x-auto border border-border">
			<table class="w-full min-w-[52rem] text-sm">
				<thead class="border-b border-border bg-surface-raised text-left">
					<tr class="text-xs text-text-muted">
						<th class="p-3 font-medium">Company</th>
						<th class="p-3 font-medium">Joined</th>
						<th class="p-3 text-right font-medium">Team</th>
						<th class="p-3 text-right font-medium">Jobs</th>
						<th class="p-3 text-right font-medium">Applications</th>
						<th class="p-3 text-right font-medium">Waiting</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.id)}
						<tr class="border-b border-border bg-surface last:border-b-0">
							<td class="p-3">
								<span class="flex flex-wrap items-center gap-2">
									<a
										href="/companies/{row.slug}"
										class="text-text underline-offset-2 hover:underline"
									>
										{row.name}
									</a>
									{#if row.verified}<Badge>Verified</Badge>{/if}
									{#if row.closed}<Badge>Closed</Badge>{/if}
								</span>
							</td>
							<td class="p-3 text-text-muted">{formatRelativeTime(row.createdAt)}</td>
							<td class="p-3 text-right text-text-muted" data-numeric>{row.members}</td>
							<td class="p-3 text-right text-text-muted" data-numeric>{row.publishedJobs}</td>
							<td class="p-3 text-right text-text-muted" data-numeric>{row.applications}</td>
							<!--
								The only column that is coloured, because it is the only one that
								means somebody should do something.
							-->
							<td
								class="p-3 text-right {row.awaitingAnswer > 0 ? 'text-warning' : 'text-text-muted'}"
								data-numeric
							>
								{row.awaitingAnswer}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
