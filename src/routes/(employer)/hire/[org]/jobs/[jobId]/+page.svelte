<script lang="ts">
	import { page } from '$app/state';
	import JobForm from '#lib/components/app/JobForm.svelte';
	import Badge, { type BadgeTone } from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { toast } from '#lib/components/ui/toast.svelte';
	import { icons } from '#lib/design/icons';
	import { label } from '#lib/utils/format';
	import { changeJobStatus, getJob, updateJob } from '../../jobs.remote';

	const orgSlug = $derived(page.params.org ?? '');
	const jobId = $derived(page.params.jobId ?? '');
	const job = $derived(await getJob({ orgSlug, jobId }));

	const STATUS_TONE: Record<string, BadgeTone> = {
		draft: 'neutral',
		pending_review: 'warning',
		published: 'success',
		paused: 'warning',
		closed: 'neutral',
		archived: 'neutral'
	};

	let working = $state(false);

	async function setStatus(status: Parameters<typeof changeJobStatus>[0]['status']) {
		working = true;
		try {
			await changeJobStatus({ orgSlug, jobId, status });
			toast.success(`Job ${status === 'published' ? 'published' : label(status).toLowerCase()}.`);
		} catch (error) {
			// The service returns publish blockers as the error message, so showing it
			// verbatim tells the employer exactly what to fix.
			toast.error(error instanceof Error ? error.message : 'Could not update the job.');
		} finally {
			working = false;
		}
	}
</script>

<svelte:head><title>{job.title} · Fann</title></svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-(--fann-space-page)">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-2">
			<h1 class="text-2xl text-text">{job.title}</h1>
			<div class="flex items-center gap-2">
				<Badge tone={STATUS_TONE[job.status]} dot>{label(job.status)}</Badge>
				{#if job.status === 'published'}
					<Button href="/jobs/{job.slug}" variant="link" size="sm">
						View public listing
						<Icon icon={icons.externalLink} class="size-3.5" />
					</Button>
				{/if}
			</div>
		</div>

		<div class="flex items-center gap-2">
			{#if job.status === 'draft' || job.status === 'paused' || job.status === 'closed'}
				<Button
					variant="primary"
					loading={working}
					disabled={job.blockers.length > 0}
					onclick={() => setStatus('published')}
				>
					<Icon icon={icons.check} class="size-3.5" />
					Publish
				</Button>
			{/if}

			{#if job.status === 'published'}
				<Button loading={working} onclick={() => setStatus('paused')}>Pause</Button>
				<Button loading={working} onclick={() => setStatus('closed')}>Close</Button>
			{/if}
		</div>
	</div>

	<!--
		Shown before publishing rather than as an error afterwards. The employer
		should know what is missing while they are still in the editor.
	-->
	{#if job.blockers.length > 0 && job.status !== 'published'}
		<div class="flex gap-3 border border-warning/25 bg-warning-subtle p-(--fann-space-panel)">
			<Icon icon={icons.warning} class="mt-0.5 size-4 shrink-0 text-warning" />
			<div class="flex flex-col gap-1">
				<p class="text-sm font-medium text-warning">Not ready to publish</p>
				<ul class="flex flex-col gap-0.5 text-sm text-text-muted">
					{#each job.blockers as blocker (blocker)}
						<li>{blocker}</li>
					{/each}
				</ul>
			</div>
		</div>
	{/if}

	<JobForm
		form={updateJob}
		{orgSlug}
		{jobId}
		initial={job}
		submitLabel={updateJob.result?.saved ? 'Saved' : 'Save changes'}
	/>
</div>
