<script lang="ts">
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime } from '#lib/utils/format';
	import { adminFailedEmails } from '../admin.remote';

	/**
	 * Delivery failures.
	 *
	 * `email_log` is what makes "the candidate was notified" checkable rather than
	 * hopeful, and this is the only place the failures in it are visible. A
	 * silently failing provider is otherwise indistinguishable from a working one.
	 */
	const rows = $derived(await adminFailedEmails());
</script>

<svelte:head><title>Email · Platform · Fann</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl text-text">Email that failed</h1>
		<p class="text-sm text-text-muted">
			Newest first. Every one of these is somebody who was not told something the product said it
			would tell them.
		</p>
	</div>

	{#if rows.length === 0}
		<EmptyState title="Nothing failed" description="Every message got through.">
			{#snippet icon()}<Icon icon={icons.check} class="size-6" />{/snippet}
		</EmptyState>
	{:else}
		<div class="flex flex-col border border-border">
			{#each rows as row (row.id)}
				<div
					class="flex flex-col gap-1 border-b border-border bg-surface p-(--fann-space-panel) last:border-b-0"
				>
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<span class="text-sm text-text">{row.subject}</span>
						<time class="text-xs text-text-subtle">{formatRelativeTime(row.createdAt)}</time>
					</div>
					<p class="text-xs text-text-muted">
						<span data-numeric>{row.tag}</span> → {row.toEmail}
					</p>
					{#if row.error}
						<p class="text-xs text-danger">{row.error}</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
