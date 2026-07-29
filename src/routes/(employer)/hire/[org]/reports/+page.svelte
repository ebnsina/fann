<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import { icons } from '#lib/design/icons';
	import { listJobs } from '../jobs.remote';
	import { hiringReport } from '../reports.remote';

	const orgSlug = $derived(page.params.org ?? '');

	const jobId = $derived(page.url.searchParams.get('job') ?? '');
	const windowDays = $derived(Number(page.url.searchParams.get('days') ?? '0'));

	const jobs = $derived(await listJobs(orgSlug));
	const report = $derived(await hiringReport({ orgSlug, jobId, windowDays }));

	const jobItems = $derived([
		{ value: '', label: 'Every job' },
		...jobs.map((job) => ({ value: job.id, label: job.title }))
	]);

	const windowItems = [
		{ value: '0', label: 'All time' },
		{ value: '30', label: 'Last 30 days' },
		{ value: '90', label: 'Last 90 days' },
		{ value: '365', label: 'Last year' }
	];

	/** `page.url` is readonly, so it is copied through its string form. */
	function setParam(key: string, value: string) {
		const url = new URL(page.url.href);
		if (value) url.searchParams.set(key, value);
		else url.searchParams.delete(key);
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}

	const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 });

	function days(value: number | null): string {
		if (value === null) return '—';
		if (value < 1) return 'under a day';
		const whole = Math.round(value);
		return `${whole} day${whole === 1 ? '' : 's'}`;
	}

	/** The widest step, so the funnel bars share one scale. */
	const widest = $derived(Math.max(1, ...report.funnel.map((step) => step.reached)));
</script>

<svelte:head><title>Reports · Fann</title></svelte:head>

<div class="flex flex-col gap-6 p-(--fann-space-page)">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div class="flex flex-col gap-1">
			<h1 class="text-2xl text-text">Reports</h1>
			<p class="text-sm text-text-muted">
				Worked out from your board. Nothing here is self-reported.
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<Select
				value={jobId}
				items={jobItems}
				size="sm"
				onValueChange={(value) => setParam('job', value)}
			/>
			<Select
				value={String(windowDays)}
				items={windowItems}
				size="sm"
				onValueChange={(value) => setParam('days', value === '0' ? '' : value)}
			/>
		</div>
	</div>

	<!--
		The count of people waiting comes first and is not a median. It is the only
		figure on this page somebody can act on this afternoon, and burying it under
		two averages would make this a page about the past.
	-->
	<div class="grid gap-px border border-border bg-border sm:grid-cols-3">
		<div class="flex flex-col gap-1 bg-surface p-(--fann-space-panel)">
			<p class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Waiting on you</p>
			<p class="text-2xl text-text" data-numeric>{report.headline.awaitingReply}</p>
			{#if report.headline.longestWaitDays !== null}
				<p
					class="text-xs {report.headline.longestWaitDays > 14
						? 'text-warning'
						: 'text-text-subtle'}"
				>
					Longest wait {days(report.headline.longestWaitDays)}
				</p>
			{:else}
				<p class="text-xs text-text-subtle">Everyone has had a reply.</p>
			{/if}
		</div>

		<div class="flex flex-col gap-1 bg-surface p-(--fann-space-panel)">
			<p class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Typical reply</p>
			<p class="text-2xl text-text" data-numeric>{days(report.headline.medianResponseDays)}</p>
			<p class="text-xs text-text-subtle">
				{#if report.headline.medianResponseDays === null}
					Not enough replies yet — we show this from
					<span data-numeric>{report.minSample}</span>.
				{:else}
					Across <span data-numeric>{report.headline.responseSample}</span> replies.
				{/if}
			</p>
		</div>

		<div class="flex flex-col gap-1 bg-surface p-(--fann-space-panel)">
			<p class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Applied to hired</p>
			<p class="text-2xl text-text" data-numeric>{days(report.headline.medianTimeToHireDays)}</p>
			<p class="text-xs text-text-subtle">
				{#if report.headline.medianTimeToHireDays === null}
					{#if report.headline.hireSample === 0}
						No hires yet.
					{:else}
						<span data-numeric>{report.headline.hireSample}</span>
						so far — we show this from <span data-numeric>{report.minSample}</span>.
					{/if}
				{:else}
					Across <span data-numeric>{report.headline.hireSample}</span> hires.
				{/if}
			</p>
		</div>
	</div>

	<Card title="How far people got" description="Everyone who ever reached each step.">
		<div class="flex flex-col gap-3">
			{#each report.funnel as step (step.kind)}
				<div class="flex items-center gap-4">
					<span class="w-24 shrink-0 text-sm text-text">{step.label}</span>
					<span class="w-12 shrink-0 text-sm text-text" data-numeric>{step.reached}</span>

					<div class="h-5 min-w-0 flex-1 bg-surface-raised">
						<!-- One scale across every row, so the shape of the funnel is the shape
						     of the data rather than of each bar's own maximum. -->
						<div
							class="h-full bg-accent-subtle"
							style="width: {(step.reached / widest) * 100}%"
						></div>
					</div>

					<span class="w-20 shrink-0 text-right text-xs text-text-subtle">
						{#if step.conversion !== null}
							<span data-numeric>{percent.format(step.conversion)}</span> of last
						{/if}
					</span>
				</div>
			{/each}
		</div>
	</Card>

	<Card title="Where time goes" description="How long people sit in each column.">
		{#if report.stages.length === 0}
			<EmptyState
				title="Nobody has been moved yet"
				description="Once you start moving people through the board, this will show where they wait."
			>
				{#snippet icon()}<Icon icon={icons.pipeline} class="size-6" />{/snippet}
			</EmptyState>
		{:else}
			<div class="flex flex-col gap-px bg-border">
				{#each report.stages as stage (stage.stageId)}
					<div class="flex flex-wrap items-center gap-4 bg-surface py-3">
						<div class="flex min-w-0 flex-1 items-center gap-2">
							<span class="truncate text-sm text-text">{stage.name}</span>
							<!-- The kind, because the name is decoration and the kind is what
							     decides what a candidate is told. -->
							<Badge>{stage.kind}</Badge>
						</div>

						<div class="flex items-center gap-6 text-sm">
							<span class="text-text-muted">
								{#if stage.medianDays === null}
									<span class="text-text-subtle">
										{#if stage.sample === 0}
											nothing finished yet
										{:else}
											<span data-numeric>{stage.sample}</span> so far
										{/if}
									</span>
								{:else}
									<span class="text-text" data-numeric>{days(stage.medianDays)}</span>
									typically
								{/if}
							</span>

							{#if stage.waiting > 0}
								<span
									class="flex items-center gap-1.5 text-xs {stage.longestWaitDays !== null &&
									stage.longestWaitDays > 14
										? 'text-warning'
										: 'text-text-subtle'}"
								>
									<Icon icon={icons.time} class="size-3.5" />
									<span data-numeric>{stage.waiting}</span> here now
									{#if stage.longestWaitDays !== null}
										· longest {days(stage.longestWaitDays)}
									{/if}
								</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</Card>

	<Card title="Where applicants came from" description="And which sources actually end in a hire.">
		<div class="flex flex-col gap-px bg-border">
			{#each report.sources as source (source.source)}
				<div class="flex items-center justify-between gap-4 bg-surface py-3">
					<span class="text-sm text-text">{source.source}</span>
					<div class="flex items-center gap-6 text-sm text-text-muted">
						<span><span class="text-text" data-numeric>{source.applications}</span> applied</span>
						<span><span class="text-text" data-numeric>{source.hired}</span> hired</span>
						<span class="w-16 text-right">
							{#if source.hireRate === null}
								<span class="text-xs text-text-subtle">—</span>
							{:else}
								<span data-numeric>{percent.format(source.hireRate)}</span>
							{/if}
						</span>
					</div>
				</div>
			{/each}
		</div>
	</Card>

	<p class="text-xs text-text-subtle">
		Medians are hidden until there are <span data-numeric>{report.minSample}</span> of something to average,
		because below that one slow week moves the figure more than how you actually work does. Candidates
		who withdrew are not counted as people you left waiting.
	</p>
</div>
