<script lang="ts">
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { toast } from '#lib/components/ui/toast.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime, label } from '#lib/utils/format';
	import { adminJobs, setJobTakenDown } from '../admin.remote';

	let term = $state('');
	const rows = $derived(await adminJobs(term));

	let confirming = $state<(typeof rows)[number] | null>(null);
	let busy = $state<string | null>(null);

	/**
	 * The only write on this console, and it is reversible.
	 *
	 * The row, its applications and their timelines are untouched — so the action
	 * can be undone and can be shown to have been wrong. Restoring puts the job
	 * back as a **draft**, never straight onto the board: re-publishing somebody
	 * else's listing on their behalf is the company's decision, not ours.
	 */
	async function apply(row: (typeof rows)[number], takenDown: boolean) {
		busy = row.id;
		try {
			await setJobTakenDown({ jobId: row.id, takenDown, term });
			toast.success(takenDown ? 'Taken off the board.' : 'Restored as a draft.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not do that.');
		} finally {
			busy = null;
			confirming = null;
		}
	}
</script>

<svelte:head><title>Jobs · Platform · Fann</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div class="flex flex-col gap-1">
			<h1 class="text-2xl text-text">Jobs</h1>
			<p class="text-sm text-text-muted">
				For taking a listing down when it should not be up. Nothing here edits one.
			</p>
		</div>
		<Input bind:value={term} placeholder="Search by title or company" class="w-64" />
	</div>

	{#if rows.length === 0}
		<EmptyState title="Nothing here" description="No job matches that.">
			{#snippet icon()}<Icon icon={icons.jobs} class="size-6" />{/snippet}
		</EmptyState>
	{:else}
		<div class="overflow-x-auto border border-border">
			<table class="w-full min-w-[52rem] text-sm">
				<thead class="border-b border-border bg-surface-raised text-left">
					<tr class="text-xs text-text-muted">
						<th class="p-3 font-medium">Job</th>
						<th class="p-3 font-medium">Status</th>
						<th class="p-3 font-medium">Published</th>
						<th class="p-3 text-right font-medium">Applicants</th>
						<th class="p-3 text-right font-medium">Action</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.id)}
						<tr class="border-b border-border bg-surface last:border-b-0">
							<td class="p-3">
								<span class="flex flex-col gap-0.5">
									<a href="/jobs/{row.slug}" class="text-text underline-offset-2 hover:underline">
										{row.title}
									</a>
									<span class="text-xs text-text-subtle">{row.companyName}</span>
								</span>
							</td>
							<td class="p-3">
								<span class="flex flex-wrap items-center gap-2">
									<Badge>{label(row.status)}</Badge>
									{#if row.takenDown}<Badge>Off the board</Badge>{/if}
								</span>
							</td>
							<td class="p-3 text-text-muted">
								{row.publishedAt ? formatRelativeTime(row.publishedAt) : '—'}
							</td>
							<td class="p-3 text-right text-text-muted" data-numeric>{row.applicants}</td>
							<td class="p-3 text-right">
								{#if row.takenDown}
									<Button
										variant="secondary"
										size="xs"
										loading={busy === row.id}
										onclick={() => apply(row, false)}
									>
										Restore as draft
									</Button>
								{:else}
									<Button variant="ghost" size="xs" onclick={() => (confirming = row)}>
										Take down
									</Button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<ConfirmDialog
	open={confirming !== null}
	title="Take this listing down?"
	description="It comes off the public board straight away. Applications already sent, and their timelines, are untouched — and you can put it back."
	confirmLabel="Take it down"
	loading={busy !== null}
	onconfirm={() => confirming && apply(confirming, true)}
	oncancel={() => (confirming = null)}
/>
