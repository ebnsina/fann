<script lang="ts">
	import { formatCompactCurrency } from '#lib/utils/format';

	/**
	 * One role's pay, drawn as a range rather than printed as a single number.
	 *
	 * A median on its own invites "so that is what it pays", which is the same
	 * false precision this product objects to in a listing that says "competitive".
	 * The bar shows the whole spread, the middle half is emphasised because that is
	 * where most offers land, and the median is a line rather than a label so it
	 * reads as one point in a distribution.
	 *
	 * It carries **no end labels of its own**. The scale is shared across every bar
	 * in a table, so a number printed under one bar's left edge would sit nowhere
	 * near the value it names — the caller draws one axis for the whole set.
	 */
	type Props = {
		p10: number;
		p25: number;
		p50: number;
		p75: number;
		p90: number;
		currency: string;
		/** Shared across a table of rows so bars are comparable, not each self-scaled. */
		scaleMin: number;
		scaleMax: number;
		/** Where a specific job sits, when this is drawn beside one. */
		marker?: number | null;
	};

	let { p10, p25, p50, p75, p90, currency, scaleMin, scaleMax, marker = null }: Props = $props();

	// A self-scaling bar would make every role look identically wide, which is the
	// one thing a reader must not conclude from a chart of different roles.
	const span = $derived(Math.max(1, scaleMax - scaleMin));
	const percent = $derived((value: number) => ((value - scaleMin) / span) * 100);
</script>

<div
	class="relative h-6"
	role="img"
	aria-label="Typically {formatCompactCurrency(p25, currency)} to {formatCompactCurrency(
		p75,
		currency
	)}, median {formatCompactCurrency(p50, currency)}"
>
	<!-- p10–p90: the whole spread, drawn faint. -->
	<div
		class="absolute top-1/2 h-1 -translate-y-1/2 bg-border-strong"
		style="left: {percent(p10)}%; width: {percent(p90) - percent(p10)}%"
	></div>

	<!-- p25–p75: where most of the market actually is. -->
	<div
		class="absolute top-1/2 h-3 -translate-y-1/2 bg-accent-subtle"
		style="left: {percent(p25)}%; width: {percent(p75) - percent(p25)}%"
	></div>

	<!-- The median. -->
	<div
		class="absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-accent"
		style="left: {percent(p50)}%"
	></div>

	{#if marker !== null}
		<!--
			This listing, against that market. A distinct shape rather than a second
			vertical line, so the two cannot be misread for one another.
		-->
		<div
			class="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-surface bg-text"
			style="left: {Math.min(100, Math.max(0, percent(marker)))}%"
		></div>
	{/if}
</div>
