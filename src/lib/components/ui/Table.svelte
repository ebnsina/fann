<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils/cn';

	type Props = {
		/** Accessible name for the table. Required — a bare grid of cells is unusable via screen reader. */
		label: string;
		/** Sticks the header while the body scrolls. Needs a bounded-height container. */
		stickyHeader?: boolean;
		class?: string;
		head: Snippet;
		children: Snippet;
	};

	let { label, stickyHeader = false, class: className, head, children }: Props = $props();
</script>

<!-- The wrapper scrolls, not the page: a wide table must never push the layout sideways. -->
<div class={cn('w-full overflow-x-auto', className)}>
	<table class="w-full border-collapse text-left text-sm" aria-label={label}>
		<thead
			class={cn(
				'border-b border-border bg-surface-sunken text-xs text-text-muted',
				stickyHeader && 'sticky top-0 z-10'
			)}
		>
			{@render head()}
		</thead>
		<tbody class="[&_tr]:border-b [&_tr]:border-border [&_tr:last-child]:border-b-0">
			{@render children()}
		</tbody>
	</table>
</div>
