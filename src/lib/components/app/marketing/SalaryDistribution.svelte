<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';
	import { formatCompactCurrency, formatSalaryRange } from '#lib/utils/format';

	type Job = {
		slug: string;
		title: string;
		companyName: string;
		salaryMin: number;
		salaryMax: number;
		salaryCurrency: string;
		salaryPeriod: string;
		annualMid: number;
	};

	type Props = {
		jobs: Job[];
		currency: string;
		/** Listings left out for being in another currency. Stated, never hidden. */
		omitted?: number;
	};

	let { jobs, currency, omitted = 0 }: Props = $props();

	/*
	 * One dot per open job, placed by what it pays.
	 *
	 * The hero says every job here shows its salary. This draws that from the jobs
	 * table, so it cannot flatter the claim — if half the board stopped publishing
	 * ranges, half the chart would vanish.
	 *
	 * Laid out as a beeswarm rather than a histogram: a histogram shows the shape
	 * of the data, a beeswarm shows the shape *and* keeps every job a separate
	 * object you can point at. That matters here, because the whole argument is
	 * that these are real listings rather than a summary someone typed.
	 */

	const VIEW = { width: 1000, height: 150, pad: 18 };
	/** Dot pitch. Wider than the dot so the swarm reads as countable, not as a blob. */
	const CELL = { x: 9, y: 7, radius: 3 };
	/** The line the swarm grows out from, in both directions. */
	const AXIS = 8;
	/** How long the swarm takes to fill in across the whole axis. */
	const SWEEP_MS = 700;
	const CENTRE = (VIEW.height - AXIS) / 2;

	/** Sorted midpoints — every quantile below reads from this one array. */
	const sorted = $derived(jobs.map((job) => job.annualMid).sort((a, b) => a - b));

	function quantile(at: number): number {
		if (sorted.length === 0) return 0;
		const position = (sorted.length - 1) * at;
		const lower = Math.floor(position);
		const upper = Math.ceil(position);
		if (lower === upper) return sorted[lower];
		return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
	}

	const median = $derived(quantile(0.5));

	// The axis spans the 2nd to 98th percentile, not the full range. One founder
	// role at $900K would otherwise push every ordinary salary into a stripe at the
	// left edge. Anything outside is clamped onto the end, so no job disappears.
	const domain = $derived.by(() => {
		const low = quantile(0.02);
		const high = quantile(0.98);
		// A degenerate spread (one job, or every job paying the same) would divide by
		// zero below; give it an arbitrary but sane width.
		return high > low ? { low, high } : { low: low * 0.8, high: (high || 1) * 1.2 };
	});

	function toX(value: number): number {
		const clamped = Math.min(Math.max(value, domain.low), domain.high);
		const ratio = (clamped - domain.low) / (domain.high - domain.low);
		return VIEW.pad + ratio * (VIEW.width - VIEW.pad * 2);
	}

	/**
	 * Beeswarm placement: dots landing in the same column grow outward from the
	 * centre line, alternating above and below it.
	 *
	 * Symmetric rather than stacked off the axis, for two reasons. It reads as the
	 * *shape* of the market — wide where jobs cluster, thin where they do not —
	 * which is the thing worth seeing. And a one-sided stack leaves the top half of
	 * the panel empty at every pay level except the most common one.
	 *
	 * Depth is capped rather than allowed to overflow: a column taller than the
	 * panel would draw over the heading above it.
	 */
	const points = $derived.by(() => {
		// A tally that lives and dies inside this one computation — it is never read
		// after the loop, so `SvelteMap` would add reactivity nothing observes.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const columns = new Map<number, number>();
		const maxRings = Math.floor((CENTRE - VIEW.pad) / CELL.y);

		return jobs.map((job) => {
			const column = Math.round(toX(job.annualMid) / CELL.x);
			const depth = columns.get(column) ?? 0;
			columns.set(column, depth + 1);

			// 0 sits on the line; then one above, one below, one further above, and so
			// on, so a column fills evenly instead of leaning one way.
			const ring = Math.min(Math.ceil(depth / 2), maxRings);
			const direction = depth % 2 === 1 ? -1 : 1;

			return {
				job,
				cx: column * CELL.x,
				cy: CENTRE + direction * ring * CELL.y
			};
		});
	});

	/** Round tick values across the domain — never the raw percentile numbers. */
	const ticks = $derived.by(() => {
		const span = domain.high - domain.low;
		if (span <= 0) return [];
		// Snap the step to a round multiple of a power of ten, so labels read as money
		// rather than as arithmetic ($50K, $100K — not $47K, $94K). 2.5 is in the set
		// because without it a span like $160K jumps straight from a $25K step to a
		// $50K one and the axis ends up with three labels across the whole chart.
		const rough = span / 8;
		const magnitude = 10 ** Math.floor(Math.log10(rough));
		const step =
			[1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;

		const values: number[] = [];
		for (let value = Math.ceil(domain.low / step) * step; value <= domain.high; value += step) {
			values.push(value);
		}
		return values;
	});

	/** Set on hover. Mouse-only enrichment — nothing here is only available this way. */
	let hovered = $state<Job | null>(null);

	/**
	 * Nearest-dot hit testing on the whole chart, rather than a handler per circle.
	 *
	 * Two reasons. A 3px target is not a target — this picks whatever the pointer is
	 * closest to, so the readout follows the mouse across the swarm instead of
	 * flickering as it slips between dots. And the circles stay presentational,
	 * which is what they should be inside an element already marked `role="img"`.
	 */
	function trackPointer(event: MouseEvent & { currentTarget: SVGSVGElement }): void {
		const box = event.currentTarget.getBoundingClientRect();
		if (box.width === 0) return;

		// The viewBox scales to the rendered width, so pointer coordinates have to be
		// mapped back into its space before they can be compared with dot positions.
		const scale = VIEW.width / box.width;
		const x = (event.clientX - box.left) * scale;
		const y = (event.clientY - box.top) * scale;

		let best: Job | null = null;
		let bestDistance = Infinity;
		for (const point of points) {
			const distance = (point.cx - x) ** 2 + (point.cy - y) ** 2;
			if (distance < bestDistance) {
				bestDistance = distance;
				best = point.job;
			}
		}

		// Beyond about three cells away the pointer is not really over the swarm, and
		// naming a job there would be a guess.
		hovered = bestDistance < (CELL.x * 3) ** 2 ? best : null;
	}
</script>

<figure class="flex flex-col border border-border bg-surface">
	<figcaption
		class="flex flex-wrap items-baseline justify-between gap-3 border-b border-dashed border-border p-(--fann-space-panel)"
	>
		<span class="text-sm font-medium text-text">
			{jobs.length}
			{jobs.length === 1 ? 'job' : 'jobs'} open right now, by what they pay
		</span>
		<span class="text-sm text-text-muted">
			Typical
			<span class="text-text" data-numeric>
				{formatCompactCurrency(median, currency)}
			</span>
		</span>
	</figcaption>

	<div class="px-(--fann-space-panel) pt-5 pb-2">
		<!--
			`role="img"` with a written summary: a screen reader gets the finding, not
			six hundred unlabelled circles. The hover readout below is an extra for
			pointer users and carries nothing that is not already said here.
		-->
		<svg
			viewBox="0 0 {VIEW.width} {VIEW.height}"
			class="h-auto w-full"
			role="img"
			aria-label="Salary distribution of {jobs.length} open jobs. Half pay more than {formatCompactCurrency(
				median,
				currency
			)}, and most fall between {formatCompactCurrency(
				quantile(0.25),
				currency
			)} and {formatCompactCurrency(quantile(0.75), currency)} a year."
			onmousemove={trackPointer}
			onmouseleave={() => (hovered = null)}
		>
			<!-- The middle half of the market, as a quiet band behind the swarm. -->
			<rect
				x={toX(quantile(0.25))}
				y="0"
				width={Math.max(0, toX(quantile(0.75)) - toX(quantile(0.25)))}
				height={VIEW.height - AXIS}
				class="fill-accent-subtle"
			/>

			<line
				x1={toX(median)}
				y1="0"
				x2={toX(median)}
				y2={VIEW.height - AXIS}
				class="stroke-accent"
				stroke-width="1.5"
				stroke-dasharray="3 3"
			/>

			{#each points as point (point.job.slug)}
				<!--
					The delay comes from the dot's own x position, so the swarm fills in up
					the pay scale rather than in whatever order the rows arrived. Capped at
					`SWEEP_MS` so the last dot is not still arriving after somebody has
					started reading. Both custom properties are data — a position on an
					axis and a computed opacity — which is why they are inline styles and
					everything else here is a class.
				-->
				<circle
					cx={point.cx}
					cy={point.cy}
					r={hovered?.slug === point.job.slug ? CELL.radius + 1.5 : CELL.radius}
					class="fann-dot fill-accent transition-[r,opacity] duration-(--fann-duration-fast)"
					style:--fann-dot-delay="{(point.cx / VIEW.width) * SWEEP_MS}ms"
					style:--fann-dot-opacity={hovered && hovered.slug !== point.job.slug ? 0.22 : 0.75}
					opacity={hovered && hovered.slug !== point.job.slug ? 0.22 : 0.75}
				/>
			{/each}

			<line
				x1="0"
				y1={VIEW.height - AXIS}
				x2={VIEW.width}
				y2={VIEW.height - AXIS}
				class="stroke-border"
			/>

			{#each ticks as tick (tick)}
				<line
					x1={toX(tick)}
					y1={VIEW.height - AXIS}
					x2={toX(tick)}
					y2={VIEW.height - AXIS + 4}
					class="stroke-border"
				/>
			{/each}
		</svg>

		<!--
			Tick labels are HTML, not SVG text. Text inside a `viewBox` scales with the
			chart, so an 11px label on a wide screen becomes 4px on a phone. These stay
			at the type scale everywhere.

			`left` is an inline style because it is the datum — the position of a value
			on an axis is computed, and there is no class that can express it. Every
			other property here is a class.
		-->
		<div class="relative mt-1 h-4">
			{#each ticks as tick (tick)}
				<span
					class="absolute -translate-x-1/2 font-mono text-2xs text-text-subtle tabular-nums"
					style:left="{(toX(tick) / VIEW.width) * 100}%"
					data-numeric
				>
					{formatCompactCurrency(tick, currency)}
				</span>
			{/each}
		</div>
	</div>

	<!--
		Fixed height. A readout that grows on hover would shove the buttons beneath
		this panel down the page as the pointer crosses it.
	-->
	<div
		class="flex min-h-14 items-center border-t border-dashed border-border px-(--fann-space-panel) py-3 text-sm"
	>
		<!--
			`{#key}` on the slug remounts this row whenever the pointer lands on a
			different job, which restarts the `fann-swap` animation. Without it the text
			is replaced outright and, at the speed a pointer crosses six hundred dots,
			the eye sees a strobe of half-read words rather than one label following the
			cursor. See `fann-swap` in `motion.css`.
		-->
		{#key hovered?.slug ?? 'idle'}
			<div class="fann-swap flex w-full items-center gap-2">
				{#if hovered}
					<span class="truncate text-text">{hovered.title}</span>
					<span class="shrink-0 text-text-subtle">·</span>
					<span class="truncate text-text-muted">{hovered.companyName}</span>
					<span class="ml-auto shrink-0 text-text" data-numeric>
						{formatSalaryRange(
							hovered.salaryMin,
							hovered.salaryMax,
							hovered.salaryCurrency,
							hovered.salaryPeriod
						)}
					</span>
				{:else}
					<Icon icon={icons.info} class="size-3.5 shrink-0 text-text-subtle" />
					<span class="text-text-muted">
						One dot is one open job. The band is the middle half of the market.
						{#if omitted > 0}
							{omitted} more {omitted === 1 ? 'pays' : 'pay'} in another currency and {omitted === 1
								? 'is'
								: 'are'} not shown.
						{/if}
					</span>
				{/if}
			</div>
		{/key}
	</div>
</figure>
