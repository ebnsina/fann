<script lang="ts">
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { toast } from '#lib/components/ui/toast.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime } from '#lib/utils/format';
	import { leaveUp, openReports, takeDown } from '../moderation.remote';

	const items = $derived(await openReports());

	let busy = $state<string | null>(null);

	async function act(item: (typeof items)[number], keep: boolean) {
		busy = item.id;
		const target = item.kind === 'post' ? { postId: item.id } : { commentId: item.id };
		try {
			if (keep) await leaveUp(target);
			else await takeDown(target);
			toast.success(keep ? 'Left up.' : 'Taken down.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not do that.');
		} finally {
			busy = null;
		}
	}
</script>

<svelte:head><title>Moderation · Fann</title></svelte:head>

<div class="mx-auto flex max-w-(--fann-shell-width) flex-col gap-6 px-(--fann-space-page) py-12">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl text-text">Reported</h1>
		<p class="text-sm text-text-muted">
			Most-reported first. Anything already hidden was hidden automatically and is waiting on a
			person.
		</p>
	</div>

	{#if items.length === 0}
		<EmptyState title="Nothing waiting" description="No open reports.">
			{#snippet icon()}<Icon icon={icons.verified} class="size-6" />{/snippet}
		</EmptyState>
	{:else}
		<div class="flex flex-col gap-px border border-border bg-border">
			{#each items as item (item.kind + item.id)}
				<article class="flex flex-col gap-3 bg-surface p-(--fann-space-panel)">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div class="flex flex-wrap items-center gap-2 text-xs text-text-subtle">
							<Badge>{item.kind}</Badge>
							<span class="text-text">{item.companyName ?? item.authorName}</span>
							<span>{formatRelativeTime(item.createdAt)}</span>
							<span aria-hidden="true">·</span>
							<span class="text-warning">
								<span data-numeric>{item.reports}</span>
								{item.reports === 1 ? 'report' : 'reports'}
							</span>
							{#if item.hidden}
								<Badge tone="danger">Hidden</Badge>
							{/if}
						</div>

						<div class="flex shrink-0 items-center gap-2">
							<Button
								size="xs"
								variant="ghost"
								loading={busy === item.id}
								onclick={() => act(item, true)}
							>
								Leave up
							</Button>
							<Button
								size="xs"
								variant="danger"
								loading={busy === item.id}
								onclick={() => act(item, false)}
							>
								Take down
							</Button>
						</div>
					</div>

					<!--
						Plain text, not rendered markdown. A moderator needs to see exactly
						what was written, including anything that would disappear once it is
						formatted.
					-->
					<p
						class="border border-dashed border-border p-3 text-sm whitespace-pre-wrap text-text-muted"
					>
						{item.body}
					</p>

					{#if item.reasons.filter(Boolean).length > 0}
						<p class="text-xs text-text-subtle">
							Reported as: {item.reasons.filter(Boolean).join(', ')}
						</p>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</div>
