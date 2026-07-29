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
		<!--
			Hover is the whole of the motion here, and it is on the cell rather than
			the icon alone: a card that lights up under the cursor tells you the grid
			is a set of separate things, which a page of hairlines otherwise leaves you
			to work out. Nothing moves layout — the surface and the icon shift, the
			text does not — so a row cannot reflow while somebody is reading it.
		-->
		<article
			class="group relative flex flex-col gap-3 bg-surface p-(--fann-space-panel) transition-colors duration-(--fann-duration-normal) ease-(--ease-out) hover:bg-surface-hover"
		>
			<!--
				A hairline that draws itself across the top on hover. `scale-x` from the
				left, so it reads as arriving rather than appearing.
			-->
			<span
				aria-hidden="true"
				class="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-accent transition-transform duration-(--fann-duration-normal) ease-(--ease-out) group-hover:scale-x-100"
			></span>

			<Icon
				icon={feature.icon}
				class="size-5 text-text-accent transition-transform duration-(--fann-duration-normal) ease-(--ease-out) group-hover:-translate-y-0.5"
			/>
			<h3 class="text-base font-semibold text-text">{feature.title}</h3>
			<p class="text-sm text-text-muted">{feature.body}</p>
		</article>
	{/each}
</div>
