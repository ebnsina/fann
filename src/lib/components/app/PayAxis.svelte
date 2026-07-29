<script lang="ts">
	import { formatCompactCurrency } from '#lib/utils/format';

	/**
	 * The shared axis under a table of `PayRange` bars.
	 *
	 * One axis for the whole set rather than labels under each bar. Every bar is
	 * drawn on the same scale, so a figure printed beneath one bar's edge would name
	 * a value the bar does not reach — which makes narrow ranges look like they
	 * span the entire market.
	 */
	type Props = {
		scaleMin: number;
		scaleMax: number;
		currency: string;
		/** How many labelled points to draw, including both ends. */
		steps?: number;
	};

	let { scaleMin, scaleMax, currency, steps = 5 }: Props = $props();

	const ticks = $derived(
		Array.from({ length: steps }, (unused, index) => {
			const fraction = index / (steps - 1);
			return { value: scaleMin + (scaleMax - scaleMin) * fraction, fraction };
		})
	);
</script>

<div class="relative h-4" aria-hidden="true">
	{#each ticks as tick (tick.fraction)}
		<span
			class="absolute top-0 text-2xs text-text-subtle"
			style="left: {tick.fraction * 100}%; transform: translateX({tick.fraction === 0
				? '0'
				: tick.fraction === 1
					? '-100%'
					: '-50%'})"
			data-numeric
		>
			{formatCompactCurrency(tick.value, currency)}
		</span>
	{/each}
</div>
