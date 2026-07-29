<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { Feature } from '#lib/content/marketing';

	type Props = { features: Feature[]; columns?: 2 | 3 };
	let { features, columns = 3 }: Props = $props();

	// A count that does not divide by the column count leaves a cell empty, and an
	// empty cell in this grid is a grey box rather than blank space — the dividers
	// are the container's background showing through a 1px gap. So a set of three
	// stays one-per-row until it can have three across, and never passes through a
	// two-column stage where it would leave one over.
	const layout = $derived.by(() => {
		const fitsThree = columns === 3 && features.length % 3 === 0;
		const fitsTwo = features.length % 2 === 0;
		if (fitsThree && fitsTwo) return 'sm:grid-cols-2 lg:grid-cols-3';
		if (fitsThree) return 'lg:grid-cols-3';
		if (fitsTwo) return 'sm:grid-cols-2';
		return '';
	});
</script>

<!--
	`gap-px` over a `bg-border` grid: hairline dividers that reflow at any column count.
-->
<div class="grid gap-px border border-border bg-border {layout}">
	{#each features as feature (feature.title)}
		<article class="flex flex-col gap-3 bg-surface p-(--fann-space-panel)">
			<Icon icon={feature.icon} class="size-5 text-text-accent" />
			<h3 class="text-base font-semibold text-text">{feature.title}</h3>
			<p class="text-sm text-text-muted">{feature.body}</p>
		</article>
	{/each}
</div>
