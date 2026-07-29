<script lang="ts">
	import { page } from '$app/state';
	import Badge, { type BadgeTone } from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Table from '#lib/components/ui/Table.svelte';
	import Td from '#lib/components/ui/Td.svelte';
	import Th from '#lib/components/ui/Th.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime, formatSalaryRange, label } from '#lib/utils/format';
	import { listJobs } from '../jobs.remote';

	const orgSlug = $derived(page.params.org ?? '');
	const jobs = $derived(await listJobs(orgSlug));

	/** Colour carries status here, so it must be legible at a glance in a dense table. */
	const STATUS_TONE: Record<string, BadgeTone> = {
		draft: 'neutral',
		pending_review: 'warning',
		published: 'success',
		paused: 'warning',
		closed: 'neutral',
		archived: 'neutral'
	};
</script>

<svelte:head><title>Jobs · Fann</title></svelte:head>

<div class="flex flex-col gap-6 p-(--fann-space-page)">
	{#if jobs.length === 0}
		<EmptyState
			title="No jobs yet"
			description="Post your first role. Every listing on Fann publishes its salary range."
		>
			{#snippet icon()}
				<Icon icon={icons.jobs} class="size-6" />
			{/snippet}
			{#snippet action()}
				<Button href="/hire/{orgSlug}/jobs/new" variant="primary">
					<Icon icon={icons.add} class="size-3.5" />
					Post a job
				</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="border border-border bg-surface">
			<Table label="Your jobs" stickyHeader>
				{#snippet head()}
					<tr>
						<Th>Role</Th>
						<Th>Status</Th>
						<Th align="right">Base salary</Th>
						<Th align="right">
							<Icon icon={icons.candidates} class="size-3" />
							Applicants
						</Th>
						<Th align="right">
							<Icon icon={icons.preview} class="size-3" />
							Views
						</Th>
						<Th>Updated</Th>
						<Th><span class="sr-only">Actions</span></Th>
					</tr>
				{/snippet}

				{#each jobs as job (job.id)}
					<tr class="transition-colors hover:bg-surface-hover">
						<Td class="font-medium">
							<a href="/hire/{orgSlug}/jobs/{job.id}" class="hover:text-text-accent">
								{job.title}
							</a>
							<span class="ml-2 text-xs font-normal text-text-subtle">
								{label(job.workMode)} · {label(job.employmentType)}
							</span>
						</Td>

						<Td>
							<Badge tone={STATUS_TONE[job.status]} dot>{label(job.status)}</Badge>
						</Td>

						<Td align="right" mono>
							{formatSalaryRange(
								job.salaryMin,
								job.salaryMax,
								job.salaryCurrency,
								job.salaryPeriod
							)}
						</Td>

						<Td align="right" mono>
							{#if job.applicantCount > 0}
								<a
									href="/hire/{orgSlug}/jobs/{job.id}/pipeline"
									class="text-text-accent underline-offset-2 hover:underline"
								>
									{job.applicantCount}
								</a>
							{:else}
								{job.applicantCount}
							{/if}
						</Td>
						<Td align="right" mono>{job.viewCount}</Td>
						<Td class="text-text-muted">{formatRelativeTime(job.updatedAt)}</Td>

						<Td align="right">
							<div class="flex items-center justify-end gap-1">
								{#if job.status === 'published'}
									<Button
										href="/jobs/{job.slug}"
										variant="ghost"
										size="xs"
										title="View public listing"
									>
										<Icon icon={icons.externalLink} class="size-3.5" />
										<span class="sr-only">View public listing</span>
									</Button>
								{/if}
								<Button href="/hire/{orgSlug}/jobs/{job.id}" variant="ghost" size="xs">
									<Icon icon={icons.edit} class="size-3.5" />
									<span class="sr-only">Edit {job.title}</span>
								</Button>
							</div>
						</Td>
					</tr>
				{/each}
			</Table>
		</div>
	{/if}
</div>
