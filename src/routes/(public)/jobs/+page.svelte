<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import JobCard from '#lib/components/app/JobCard.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Checkbox from '#lib/components/ui/Checkbox.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Skeleton from '#lib/components/ui/Skeleton.svelte';
	import { icons } from '#lib/design/icons';
	import {
		EMPLOYMENT_TYPE_OPTIONS,
		EXPERIENCE_LEVEL_OPTIONS,
		WORK_MODE_OPTIONS
	} from '#lib/schemas/job';
	import { findJobs } from './jobs.remote';

	type Facet = { value: string; count: number };

	// Filter state lives in the URL: every result set is linkable, shareable and
	// crawlable, and the back button does what people expect.
	const params = $derived(page.url.searchParams);
	const q = $derived(params.get('q') ?? '');
	const sort = $derived((params.get('sort') ?? 'relevance') as 'relevance' | 'recent' | 'salary');
	const pageNumber = $derived(Number(params.get('page') ?? '1') || 1);
	// Set when arriving from the companies directory.
	const companySlug = $derived(params.get('company') ?? '');

	const selected = $derived({
		workModes: params.getAll('workMode'),
		employmentTypes: params.getAll('employmentType'),
		experienceLevels: params.getAll('experienceLevel')
	});

	const results = $derived(
		await findJobs({
			q,
			workModes: selected.workModes as never,
			employmentTypes: selected.employmentTypes as never,
			experienceLevels: selected.experienceLevels as never,
			companySlug: companySlug || undefined,
			page: pageNumber,
			sort
		})
	);

	/** Company name for the scoped header, taken from the results themselves. */
	const scopedCompany = $derived(companySlug ? results.results[0]?.companyName : undefined);

	const totalPages = $derived(Math.max(1, Math.ceil(results.total / results.perPage)));

	function update(mutate: (next: URLSearchParams) => void, { resetPage = true } = {}) {
		// A throwaway builder, not reactive state — it is serialized into a `goto`
		// on the next line and never read again, so `SvelteURLSearchParams` would
		// add reactivity nothing observes.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const next = new URLSearchParams(params.toString());
		mutate(next);
		if (resetPage) next.delete('page');
		goto(`/jobs?${next}`, { keepFocus: true, noScroll: true });
	}

	function toggleFacet(key: string, value: string) {
		update((next) => {
			const current = next.getAll(key);
			next.delete(key);
			for (const existing of current) {
				if (existing !== value) next.append(key, existing);
			}
			if (!current.includes(value)) next.append(key, value);
		});
	}

	// Writable derived: tracks the URL, but the user can type over it freely.
	let searchTerm = $derived(q);

	/**
	 * Every option, always, in a fixed order — never only the ones with matches.
	 *
	 * The server counts each group with the other two applied but not its own, so
	 * an unticked box means "this many more if you add this". What it cannot do is
	 * return a row for a value nothing matches, and dropping those from the list
	 * made the sidebar change height as you filtered: tick something under
	 * Employment and a Work mode option could vanish, taking every group below it
	 * up the page while the pointer was still moving. So the canonical list is the
	 * one rendered, and a value with no matches is shown at zero and disabled
	 * rather than removed.
	 *
	 * The order is the canonical order too. Sorting by count looks tidier on the
	 * first load and then reshuffles under the cursor every time a number changes,
	 * which is the same complaint in a different shape.
	 */
	const FACET_GROUPS = [
		{
			key: 'workMode',
			title: 'Work mode',
			options: WORK_MODE_OPTIONS,
			facets: () => results.facets.workMode
		},
		{
			key: 'employmentType',
			title: 'Employment',
			options: EMPLOYMENT_TYPE_OPTIONS,
			facets: () => results.facets.employmentType
		},
		{
			key: 'experienceLevel',
			title: 'Experience',
			options: EXPERIENCE_LEVEL_OPTIONS,
			facets: () => results.facets.experienceLevel
		}
	];

	/** Count for one value, or zero when nothing matches it. */
	function countFor(facets: Facet[], value: string): number {
		return facets.find((facet) => facet.value === value)?.count ?? 0;
	}

	const activeCount = $derived(
		selected.workModes.length + selected.employmentTypes.length + selected.experienceLevels.length
	);
</script>

<svelte:head>
	<title>{q ? `${q} jobs` : 'Jobs'} · Fann</title>
	<meta name="description" content="Browse open roles. Every listing shows its salary range." />
</svelte:head>

<!--
	Wider than the marketing shell on purpose. This is the one page with a filter
	column *and* a results list, and squeezing both into the shell width leaves the
	job titles truncating.
-->
<div class="mx-auto flex max-w-6xl gap-8 p-(--fann-space-page)">
	<!-- Filters ---------------------------------------------------------- -->
	<aside class="hidden w-56 shrink-0 flex-col gap-6 lg:flex" aria-label="Filters">
		<!--
			Fixed height, because "Clear" appears only when something is selected and
			the link is two pixels taller than the heading beside it. Two pixels is
			enough to shift every group below on the first tick, which is the same
			complaint as the vanishing options, just smaller.
		-->
		<div class="flex h-5 items-center justify-between">
			<h2 class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Filters</h2>
			{#if activeCount > 0}
				<button
					type="button"
					class="text-xs text-text-accent underline-offset-2 hover:underline"
					onclick={() =>
						update((next) => {
							next.delete('workMode');
							next.delete('employmentType');
							next.delete('experienceLevel');
						})}
				>
					Clear
				</button>
			{/if}
		</div>

		{#each FACET_GROUPS as group (group.key)}
			{@const facets = group.facets() as Facet[]}
			<fieldset class="flex flex-col gap-2.5">
				<legend class="mb-1 text-xs font-medium text-text">{group.title}</legend>
				{#each group.options as option (option.value)}
					{@const count = countFor(facets, option.value)}
					{@const checked = params.getAll(group.key).includes(option.value)}
					<!--
						A zero stays on the page, greyed and unclickable. Removing it is what
						made the column jump; disabling it says "nothing here matches that"
						without moving anything. Still clickable while ticked, or you could
						filter yourself into a corner you cannot get out of.
					-->
					<div
						class="flex items-center justify-between gap-2 {count === 0 && !checked
							? 'opacity-45'
							: ''}"
					>
						<Checkbox
							label={option.label}
							{checked}
							disabled={count === 0 && !checked}
							onCheckedChange={() => toggleFacet(group.key, option.value)}
						/>
						<span class="font-mono text-2xs text-text-subtle tabular-nums">{count}</span>
					</div>
				{/each}
			</fieldset>
		{/each}
	</aside>

	<!-- Results ---------------------------------------------------------- -->
	<div class="flex min-w-0 flex-1 flex-col gap-4">
		<form
			class="flex items-center gap-3"
			onsubmit={(event) => {
				event.preventDefault();
				update((next) => {
					if (searchTerm.trim()) next.set('q', searchTerm.trim());
					else next.delete('q');
				});
			}}
		>
			<div class="relative flex-1">
				<Icon
					icon={icons.search}
					class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle"
				/>
				<Input
					bind:value={searchTerm}
					size="lg"
					class="pl-9"
					placeholder="Search by title, skill or company"
					aria-label="Search jobs"
				/>
			</div>

			<Select
				value={sort}
				items={[
					{ value: 'relevance', label: 'Most relevant' },
					{ value: 'recent', label: 'Newest' },
					{ value: 'salary', label: 'Highest salary' }
				]}
				class="w-44"
				onValueChange={(next: string) => update((p) => p.set('sort', next))}
			/>
		</form>

		<svelte:boundary>
			{#snippet pending()}
				<div class="flex flex-col gap-px">
					{#each { length: 6 }}
						<Skeleton height="8.5rem" />
					{/each}
				</div>
			{/snippet}

			{#if companySlug}
				<div class="flex flex-wrap items-center gap-3 border border-border bg-surface p-4">
					<Icon icon={icons.companies} class="size-4 text-text-muted" />
					<p class="text-sm text-text">
						Showing roles at <strong class="font-medium">{scopedCompany ?? companySlug}</strong>
					</p>
					<div class="flex-1"></div>
					<Button size="sm" href="/jobs">Clear</Button>
				</div>
			{/if}

			<div class="flex items-center justify-between">
				<p class="text-sm text-text-muted">
					<span class="font-mono tabular-nums" data-numeric>{results.total}</span>
					{results.total === 1 ? 'job' : 'jobs'}
					{#if q}matching “{q}”{/if}
				</p>
				{#if activeCount > 0}
					<Badge tone="accent">{activeCount} filter{activeCount === 1 ? '' : 's'}</Badge>
				{/if}
			</div>

			{#if results.results.length === 0}
				<EmptyState
					title="No jobs match that"
					description="Try fewer filters, or a broader search term."
				>
					{#snippet action()}
						<Button variant="primary" size="sm" href="/jobs">Clear everything</Button>
					{/snippet}
				</EmptyState>
			{:else}
				<div class="border border-border">
					{#each results.results as job (job.id)}
						<JobCard {job} />
					{/each}
				</div>

				{#if totalPages > 1}
					<nav class="flex items-center justify-between pt-2" aria-label="Pagination">
						<Button
							size="sm"
							disabled={pageNumber <= 1}
							onclick={() =>
								update((next) => next.set('page', String(pageNumber - 1)), { resetPage: false })}
						>
							Previous
						</Button>

						<p class="font-mono text-xs text-text-muted tabular-nums">
							{pageNumber} / {totalPages}
						</p>

						<Button
							size="sm"
							disabled={pageNumber >= totalPages}
							onclick={() =>
								update((next) => next.set('page', String(pageNumber + 1)), { resetPage: false })}
						>
							Next
						</Button>
					</nav>
				{/if}
			{/if}
		</svelte:boundary>
	</div>
</div>
