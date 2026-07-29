<script lang="ts">
	import ResponseCard from '#lib/components/app/ResponseCard.svelte';
	import VerifiedMark from '#lib/components/app/VerifiedMark.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';
	import { listCompanies } from './companies.remote';
	import { formatCompactCurrency } from '#lib/utils/format';

	const companies = $derived(await listCompanies());
</script>

<svelte:head>
	<title>Companies hiring · Fann</title>
	<meta
		name="description"
		content="{companies.length} companies hiring right now, each publishing salary ranges on every role."
	/>
</svelte:head>

<div class="mx-auto flex max-w-(--fann-shell-width) flex-col gap-8 p-(--fann-space-page)">
	<div class="flex flex-col gap-2">
		<h1 class="text-2xl text-text lg:text-3xl">Companies hiring</h1>
		<p class="max-w-2xl text-base text-text-muted">
			Every company here publishes a salary range on every role. Median pay is across their open
			listings.
		</p>
	</div>

	{#if companies.length === 0}
		<EmptyState
			title="Nobody is hiring right now"
			description="When a company posts a role it will show up here."
		>
			{#snippet icon()}<Icon icon={icons.companies} class="size-6" />{/snippet}
			{#snippet action()}
				<Button href="/for-employers" variant="primary" size="sm">
					Post the first one
					<Icon icon={icons.arrowRight} class="size-3.5" />
				</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="grid gap-px border border-border bg-border sm:grid-cols-2">
			{#each companies as company (company.slug)}
				<a
					href="/companies/{company.slug}"
					class="group flex flex-col justify-between gap-4 bg-surface p-(--fann-space-panel) transition-colors hover:bg-surface-hover"
				>
					<div class="flex flex-col gap-2">
						<div class="flex items-start justify-between gap-3">
							<h2
								class="flex min-w-0 items-center gap-1.5 text-base font-medium text-text group-hover:text-text-accent"
							>
								{#if company.verified}
									<VerifiedMark />
								{/if}
								<span class="truncate">{company.name}</span>
							</h2>
							<Badge icon={icons.jobs}>
								{company.openRoles}
								{company.openRoles === 1 ? 'role' : 'roles'}
							</Badge>
						</div>

						{#if company.tagline}
							<p class="text-sm text-text-muted">{company.tagline}</p>
						{/if}
					</div>

					<div class="flex flex-wrap items-center gap-3 text-xs text-text-subtle">
						{#if company.medianSalary}
							<span class="flex items-center gap-1.5">
								<Icon icon={icons.salary} class="size-3.5" />
								<span class="font-mono tabular-nums" data-numeric>
									{formatCompactCurrency(company.medianSalary)}
								</span>
								median
							</span>
						{/if}

						{#if company.size}
							<span class="flex items-center gap-1.5">
								<Icon icon={icons.candidates} class="size-3.5" />
								{company.size}
							</span>
						{/if}

						<!--
							Same component as the company page, so a row here and the page it
							links to cannot describe the same employer differently.
						-->
						<ResponseCard
							variant="compact"
							stats={company.stats}
							promisedDays={company.respondsWithin}
						/>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
