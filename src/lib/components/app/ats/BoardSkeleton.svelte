<script lang="ts">
	import Skeleton from '#lib/components/ui/Skeleton.svelte';

	type Props = {
		/** Match the number of columns the board usually has, so nothing jumps. */
		columns?: number;
	};

	let { columns = 5 }: Props = $props();
</script>

<!--
	Sized to the real board, not to a generic grey box.

	The columns are `w-72` and the cards are the height a card actually is, because
	a skeleton that is a different size to the thing it stands in for causes exactly
	the layout shift it exists to prevent.

	`aria-busy` on a live region rather than a spinner: a screen reader is told the
	board is loading once, instead of reading out a dozen decorative placeholders.
-->
<div class="flex gap-4 overflow-x-hidden pb-4" aria-busy="true" aria-live="polite">
	<span class="sr-only">Loading the board…</span>

	{#each { length: columns }, column (column)}
		<div class="flex w-72 shrink-0 flex-col border border-border bg-surface">
			<div class="flex flex-col gap-2 border-b border-dashed border-border p-4">
				<Skeleton height="1rem" width="40%" />
				<Skeleton height="1.25rem" width="5rem" />
			</div>

			<div class="flex min-h-32 flex-col gap-px bg-border">
				<!-- Fewer cards in later columns, the way a real pipeline narrows. -->
				{#each { length: Math.max(1, 3 - column) }, card (card)}
					<div class="flex flex-col gap-3 bg-surface p-3">
						<Skeleton height="0.875rem" width="60%" />
						<Skeleton height="0.75rem" width="80%" />
						<Skeleton height="1.75rem" />
					</div>
				{/each}
			</div>
		</div>
	{/each}
</div>
