<script lang="ts">
	import PayRange from './PayRange.svelte';
	import { formatCompactCurrency } from '#lib/utils/format';

	/**
	 * One job against its market.
	 *
	 * The earlier version of this was a bare bar with two unlabelled marks and a
	 * sentence underneath explaining which was which — "the diamond is this one".
	 * A chart that needs a key to read is a chart that has not been drawn. So every
	 * mark here carries its own number, and the legend names the shapes rather than
	 * describing them in prose.
	 *
	 * The three figures below the bar are the point: somebody deciding whether to
	 * apply wants "this job pays X, similar jobs pay Y" in numbers, and the bar is
	 * there to show the shape of the gap, not to be the only way of seeing it.
	 */
	type Props = {
		p10: number;
		p25: number;
		p50: number;
		p75: number;
		p90: number;
		currency: string;
		/** This job's annualised midpoint. */
		marker: number;
		occupationName: string;
		sampleSize: number;
	};

	let { p10, p25, p50, p75, p90, currency, marker, occupationName, sampleSize }: Props = $props();

	const money = (value: number) => formatCompactCurrency(value, currency);

	// Padded a little past the ends, so a job sitting exactly at the edge is not
	// drawn half outside the track.
	const span = $derived(Math.max(1, p90 - p10));
	const scaleMin = $derived(Math.min(p10, marker) - span * 0.08);
	const scaleMax = $derived(Math.max(p90, marker) + span * 0.08);
</script>

<div class="flex flex-col gap-3">
	<!--
		The two numbers a reader actually came for, side by side and named, before
		any chart. Everything below explains the gap between them.
	-->
	<dl class="grid gap-px border border-border bg-border sm:grid-cols-2">
		<div class="flex flex-col gap-0.5 bg-surface p-3">
			<dt class="text-2xs font-medium tracking-wide text-text-subtle uppercase">This job</dt>
			<dd class="text-lg text-text" data-numeric>{money(marker)}</dd>
		</div>
		<div class="flex flex-col gap-0.5 bg-surface p-3">
			<dt class="text-2xs font-medium tracking-wide text-text-subtle uppercase">
				Typical for this role
			</dt>
			<dd class="text-lg text-text" data-numeric>{money(p50)}</dd>
		</div>
	</dl>

	<PayRange {p10} {p25} {p50} {p75} {p90} {currency} {scaleMin} {scaleMax} {marker} />

	<!--
		A key that shows the shapes rather than naming them in a sentence, and every
		mark on the bar appears here exactly once, with its figure.

		The bar deliberately carries no axis of its own. An axis would have to be
		labelled from the padded scale — which is a number no job has — and on a
		tight market compact formatting rounds the end of the range and the marker to
		the same figure, so the chart appears to say two different things about one
		value. Naming each mark once removes both problems.
	-->
	<ul class="flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs text-text-subtle">
		<li class="flex items-center gap-1.5">
			<span aria-hidden="true" class="size-2.5 shrink-0 rotate-45 border border-surface bg-text"
			></span>
			This job <span class="text-text" data-numeric>{money(marker)}</span>
		</li>
		<li class="flex items-center gap-1.5">
			<span aria-hidden="true" class="h-3 w-0.5 shrink-0 bg-accent"></span>
			Typical <span class="text-text" data-numeric>{money(p50)}</span>
		</li>
		<li class="flex items-center gap-1.5">
			<span aria-hidden="true" class="h-2 w-4 shrink-0 bg-accent-subtle"></span>
			Where most pay
			<span class="text-text" data-numeric>{money(p25)}–{money(p75)}</span>
		</li>
		<li class="flex items-center gap-1.5">
			<span aria-hidden="true" class="h-1 w-4 shrink-0 bg-border-strong"></span>
			Lowest to highest
			<span class="text-text" data-numeric>{money(p10)}–{money(p90)}</span>
		</li>
	</ul>

	<p class="text-2xs text-text-subtle">
		Worked out from <span data-numeric>{sampleSize}</span>
		other {occupationName.toLowerCase()} jobs on this board.
	</p>
</div>
