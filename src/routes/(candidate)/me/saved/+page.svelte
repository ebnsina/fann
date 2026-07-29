<script lang="ts">
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { toast } from '#lib/components/ui/toast.svelte';
	import { icons } from '#lib/design/icons';
	import { employmentTypeIcon, responsePromiseIcon, workModeIcon } from '#lib/design/job-icons';
	import { formatRelativeTime, formatSalaryRange, label } from '#lib/utils/format';
	import { mySavedJobs, toggleSaved } from '../../saved.remote';

	const saved = $derived(await mySavedJobs());

	let removing = $state<string | null>(null);

	async function unsave(id: string, title: string) {
		removing = id;
		try {
			await toggleSaved(id);
			toast.success(`Removed ${title}.`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not remove that.');
		} finally {
			removing = null;
		}
	}
</script>

<svelte:head><title>Saved jobs · Fann</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl text-text">Saved jobs</h1>
		<p class="text-sm text-text-muted">
			Only you can see this. Saving a job tells the company nothing.
		</p>
	</div>

	{#if saved.length === 0}
		<EmptyState
			title="Nothing saved yet"
			description="Save a job from its listing and it will wait for you here."
		>
			{#snippet icon()}<Icon icon={icons.save} class="size-6" />{/snippet}
			{#snippet action()}
				<Button href="/jobs" variant="primary" size="sm">Browse jobs</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="border border-border">
			{#each saved as job (job.id)}
				<article
					class="flex flex-col gap-3 border-b border-border bg-surface p-(--fann-space-panel) last:border-b-0"
				>
					<div class="flex items-start justify-between gap-4">
						<div class="flex min-w-0 flex-col gap-1">
							<h2 class="text-base font-medium text-text">
								<a href="/jobs/{job.slug}" class="hover:text-text-accent">{job.title}</a>
							</h2>
							<p class="text-sm text-text-muted">
								<a href="/companies/{job.companySlug}" class="underline-offset-2 hover:underline">
									{job.companyName}
								</a>
							</p>
						</div>

						<p class="shrink-0 text-sm text-text" data-numeric>
							{formatSalaryRange(
								job.salaryMin,
								job.salaryMax,
								job.salaryCurrency,
								job.salaryPeriod
							)}
						</p>
					</div>

					<div class="flex flex-wrap items-center gap-2">
						<Badge icon={workModeIcon(job.workMode)}>{label(job.workMode)}</Badge>
						<Badge icon={employmentTypeIcon(job.employmentType)}>
							{label(job.employmentType)}
						</Badge>
						{#if job.responseSlaDays}
							<!-- A promise, not a record. See JobCard. -->
							<Badge icon={responsePromiseIcon()}>Promises {job.responseSlaDays}d</Badge>
						{/if}
						{#if !job.open}
							<!--
								Kept in the list rather than quietly dropped. A saved job that
								disappears looks like the product lost it; one that says it closed
								tells the person what actually happened.
							-->
							<Badge tone="neutral">Closed</Badge>
						{/if}
					</div>

					<div class="flex flex-wrap items-center gap-3 text-xs">
						<span class="text-text-subtle">Saved {formatRelativeTime(job.savedAt)}</span>
						<div class="flex-1"></div>

						{#if job.open}
							<Button size="xs" variant="ghost" href="/jobs/{job.slug}/apply">Apply</Button>
						{/if}
						<Button
							size="xs"
							variant="ghost"
							loading={removing === job.id}
							onclick={() => unsave(job.id, job.title)}
						>
							Remove
						</Button>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>
