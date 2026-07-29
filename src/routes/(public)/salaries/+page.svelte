<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PayAxis from '#lib/components/app/PayAxis.svelte';
	import PayLegend from '#lib/components/app/PayLegend.svelte';
	import PayRange from '#lib/components/app/PayRange.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';
	import { formatCompactCurrency, label } from '#lib/utils/format';
	import { payBenchmarks } from './salaries.remote';

	const source = $derived(
		page.url.searchParams.get('source') === 'reported' ? 'reported' : 'advertised'
	);
	const data = $derived(await payBenchmarks(source));

	/**
	 * One scale across every bar on the page.
	 *
	 * Scaling each row to itself would draw a data analyst's range the same width
	 * as an engineering manager's, which is the one conclusion a reader must not
	 * take away from a chart comparing roles.
	 */
	// The scale spans the data, not zero. Anchoring at zero is technically
	// truthful and practically useless here — every bar collapses into the same
	// sliver at the right-hand end. The axis is labelled at both ends, so a
	// reader can see where it starts rather than having to assume.
	const lowest = $derived(Math.min(...data.benchmarks.map((row) => row.p10)));
	const highest = $derived(Math.max(...data.benchmarks.map((row) => row.p90)));
	const padding = $derived(Math.max(1, (highest - lowest) * 0.05));
	const scaleMin = $derived(lowest - padding);
	const scaleMax = $derived(highest + padding);

	const asOf = new Intl.DateTimeFormat(undefined, {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});

	// `page.url` is readonly, so it is copied through its string form rather than
	// mutated in place.
	function setSource(next: string) {
		const url = new URL(page.url.href);
		url.searchParams.set('source', next);
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>What jobs pay · Fann</title>
	<meta
		name="description"
		content="Typical pay by role and level, worked out from the salary ranges published on Fann and from what people report earning."
	/>
</svelte:head>

<div class="mx-auto flex max-w-(--fann-shell-width) flex-col gap-8 px-(--fann-space-page) py-12">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div class="flex flex-col gap-3">
			<h1 class="text-3xl text-text">What these jobs pay</h1>
			<p class="max-w-2xl text-base text-text-muted">
				Worked out from the jobs on this board, which all have to publish a range. Nothing here is a
				survey we bought or a number a company gave us for marketing.
			</p>
		</div>

		<Button href="/salaries/report" variant="primary">
			<Icon icon={icons.salary} class="size-4" />
			Report your pay
		</Button>
	</div>

	<!--
		Two sources, never blended — see `services/salary.ts`. The toggle is the whole
		point of the page: an advertised range and what people say they take home are
		different measurements, and the gap between them is worth seeing.
	-->
	<div class="flex flex-col gap-3">
		<div class="flex w-fit gap-px border border-border bg-border">
			{#each [{ value: 'advertised', text: 'What jobs advertise' }, { value: 'reported', text: 'What people report earning' }] as option (option.value)}
				<button
					type="button"
					onclick={() => setSource(option.value)}
					aria-pressed={source === option.value}
					class="px-4 py-2 text-sm transition-colors {source === option.value
						? 'bg-surface-raised font-medium text-text'
						: 'bg-surface text-text-muted hover:bg-surface-hover hover:text-text'}"
				>
					{option.text}
				</button>
			{/each}
		</div>

		<p class="text-xs text-text-subtle">
			{#if source === 'advertised'}
				Every open listing here, using the middle of its published range.
			{:else}
				Reported by people directly. We have not verified any of it, and we do not pretend to. It is
				only as good as the number of people who fill it in.
			{/if}
			{#if data.refreshedAt}
				Worked out on <span data-numeric>{asOf.format(data.refreshedAt)}</span>.
			{/if}
		</p>
	</div>

	{#if data.benchmarks.length === 0}
		<EmptyState
			title="Not enough to say yet"
			description="A figure needs at least eight jobs behind it before we will print it. Nothing has reached that yet."
		>
			{#snippet icon()}<Icon icon={icons.salary} class="size-6" />{/snippet}
		</EmptyState>
	{:else}
		<div class="flex flex-col border border-border">
			{#each data.benchmarks as row (row.occupationId + row.experienceLevel)}
				<a
					href="/salaries/{row.occupationSlug}?source={source}"
					class="grid grid-cols-1 items-center gap-3 border-b border-border bg-surface p-(--fann-space-panel) transition-colors last:border-b-0 hover:bg-surface-hover sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
				>
					<div class="flex flex-col gap-1">
						<span class="text-sm font-medium text-text">{row.occupationName}</span>
						<span class="flex items-center gap-2 text-xs text-text-subtle">
							<Badge>{label(row.experienceLevel)}</Badge>
							<!--
								The sample size sits beside every figure rather than in a footnote.
								It is the difference between a median and an anecdote, and burying
								it is how a chart like this becomes misleading.
							-->
							<span data-numeric>{row.sampleSize}</span>
							{source === 'advertised' ? 'jobs' : 'reports'}
						</span>
					</div>

					<!--
						The median in words as well as on the axis. The bar answers "how does
						this role compare"; a person who only wants the number should not have
						to read a position off a chart to get it.
					-->
					<div class="flex items-center gap-4">
						<span class="w-20 shrink-0 text-sm text-text" data-numeric>
							{formatCompactCurrency(row.p50, row.currency)}
						</span>
						<div class="min-w-0 flex-1">
							<PayRange {...row} {scaleMin} {scaleMax} />
						</div>
					</div>
				</a>
			{/each}
		</div>

		<!--
			One axis for every bar above it — see PayAxis — and the key to what the
			marks mean, both indented into the same column as the bars. Left against
			the page edge the key sits a screen's width from the shapes it names.
		-->
		<div class="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
			<div class="hidden sm:block"></div>
			<div class="flex items-center gap-4 px-(--fann-space-panel) sm:px-0">
				<span class="w-20 shrink-0"></span>
				<div class="flex min-w-0 flex-1 flex-col gap-2">
					<PayAxis {scaleMin} {scaleMax} currency={data.benchmarks[0].currency} />
					<PayLegend />
				</div>
			</div>
		</div>

		<div class="border-t border-dashed border-border pt-4">
			<p class="max-w-2xl text-xs text-text-subtle">
				Hourly and daily rates are converted to a year at 40 hours a week, which is a convention
				rather than a measurement. Only {data.benchmarks[0]?.currency} is shown — there is no exchange
				rate in this product, and inventing one would be worse than leaving a currency out.
			</p>
		</div>
	{/if}
</div>
