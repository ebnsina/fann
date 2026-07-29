<script lang="ts">
	import { page } from '$app/state';
	import PayAxis from '#lib/components/app/PayAxis.svelte';
	import PayLegend from '#lib/components/app/PayLegend.svelte';
	import PayRange from '#lib/components/app/PayRange.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';
	import { formatCompactCurrency, label } from '#lib/utils/format';
	import { payForOccupation } from '../salaries.remote';

	const source = $derived(
		page.url.searchParams.get('source') === 'reported' ? 'reported' : 'advertised'
	);
	const data = $derived(await payForOccupation({ slug: page.params.slug ?? '', source }));

	/** One scale across every bar here, so levels are comparable to each other. */
	const rows = $derived([...data.overall, ...data.byLocation]);
	// The scale spans the data, not zero. Anchoring at zero is technically
	// truthful and practically useless here — every bar collapses into the same
	// sliver at the right-hand end. The axis is labelled at both ends, so a
	// reader can see where it starts rather than having to assume.
	const lowest = $derived(Math.min(...rows.map((row) => row.p10)));
	const highest = $derived(Math.max(...rows.map((row) => row.p90)));
	const padding = $derived(Math.max(1, (highest - lowest) * 0.05));
	const scaleMin = $derived(lowest - padding);
	const scaleMax = $derived(highest + padding);

	const asOf = new Intl.DateTimeFormat(undefined, {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
</script>

<svelte:head>
	<title>{data.name} pay · Fann</title>
	<meta
		name="description"
		content="What a {data.name} is paid, by level, worked out from the salary ranges published on Fann."
	/>
</svelte:head>

<div class="mx-auto flex max-w-(--fann-shell-width) flex-col gap-8 px-(--fann-space-page) py-12">
	<div class="flex flex-col gap-3">
		<a
			href="/salaries?source={source}"
			class="flex w-fit items-center gap-1.5 text-xs text-text-muted hover:text-text"
		>
			<Icon icon={icons.chevronLeft} class="size-3" />
			All roles
		</a>

		<h1 class="text-3xl text-text">{data.name}</h1>
		<p class="text-sm text-text-muted">
			{#if source === 'advertised'}
				What companies are advertising right now.
			{:else}
				What people say they are actually paid. Unverified.
			{/if}
			Worked out on <span data-numeric>{asOf.format(data.refreshedAt)}</span>.
		</p>
	</div>

	<section class="flex flex-col gap-4">
		<h2 class="text-sm font-medium text-text">By level</h2>

		<div class="flex flex-col border border-border">
			{#each data.overall as row (row.experienceLevel)}
				<div
					class="grid grid-cols-1 items-center gap-3 border-b border-border bg-surface p-(--fann-space-panel) last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
				>
					<div class="flex items-center gap-2">
						<Badge>{label(row.experienceLevel)}</Badge>
						<span class="text-xs text-text-subtle">
							<span data-numeric>{row.sampleSize}</span>
							{source === 'advertised' ? 'jobs' : 'reports'}
						</span>
					</div>

					<div class="flex items-center gap-4">
						<span class="w-20 shrink-0 text-sm text-text" data-numeric>
							{formatCompactCurrency(row.p50, row.currency)}
						</span>
						<div class="min-w-0 flex-1"><PayRange {...row} {scaleMin} {scaleMax} /></div>
					</div>
				</div>
			{/each}

			<!--
				The axis and the key to the marks, both indented into the same column as
				the bars — against the page edge the key sits a screen's width from the
				shapes it names. It appears once: the second table below shares this
				scale and these marks, and repeating it is the reader being told twice.
			-->
			<div class="flex items-center gap-4 bg-surface px-(--fann-space-panel) pb-3">
				<span class="w-20 shrink-0"></span>
				<div class="flex min-w-0 flex-1 flex-col gap-2">
					<PayAxis {scaleMin} {scaleMax} currency={rows[0].currency} />
					<PayLegend />
				</div>
			</div>
		</div>
	</section>

	{#if data.byLocation.length > 0}
		<section class="flex flex-col gap-4">
			<h2 class="text-sm font-medium text-text">Where there is enough data to say more</h2>
			<!--
				Only cities that cleared the sample threshold on their own. Most will not,
				and showing them as blanks would suggest those places pay nothing.
			-->
			<div class="flex flex-col border border-border">
				{#each data.byLocation as row (row.experienceLevel + row.locationId)}
					<div
						class="grid grid-cols-1 items-center gap-3 border-b border-border bg-surface p-(--fann-space-panel) last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
					>
						<div class="flex flex-col gap-1">
							<span class="text-sm text-text">{row.locationLabel}</span>
							<span class="flex items-center gap-2 text-xs text-text-subtle">
								<Badge>{label(row.experienceLevel)}</Badge>
								<span data-numeric>{row.sampleSize}</span>
								{source === 'advertised' ? 'jobs' : 'reports'}
							</span>
						</div>

						<div class="flex items-center gap-4">
							<span class="w-20 shrink-0 text-sm text-text" data-numeric>
								{formatCompactCurrency(row.p50, row.currency)}
							</span>
							<div class="min-w-0 flex-1"><PayRange {...row} {scaleMin} {scaleMax} /></div>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>
