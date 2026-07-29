<script lang="ts">
	import Form from '#lib/components/ui/Form.svelte';
	import { page } from '$app/state';
	import Button from '#lib/components/ui/Button.svelte';
	import FormActions from '#lib/components/ui/FormActions.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import { icons } from '#lib/design/icons';
	import { formatSalaryRange } from '#lib/utils/format';
	import { applyToJob, hasApplied, myResumes } from '../../../../(candidate)/applications.remote';
	import { getJob } from '../../jobs.remote';

	const job = $derived(await getJob(page.params.slug ?? ''));
	const applied = $derived(await hasApplied(job.id));
	const resumes = $derived(await myResumes());

	const resumeOptions = $derived([
		...resumes.map((resume) => ({ value: resume.id, label: resume.label })),
		{ value: '', label: 'Upload a new file…' }
	]);

	// Default to an existing resume when there is one — re-uploading the same PDF
	// for every application is the tax most job boards charge.
	let selectedResume = $derived(resumes[0]?.id ?? '');
</script>

<svelte:head><title>Apply · {job.title} · Fann</title></svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-6 p-(--fann-space-page)">
	<nav class="text-xs text-text-subtle">
		<a href="/jobs/{job.slug}" class="underline-offset-2 hover:text-text hover:underline">
			{job.title}
		</a>
	</nav>

	<div class="flex flex-col gap-2">
		<h1 class="text-2xl text-text">Apply for {job.title}</h1>
		<p class="text-sm text-text-muted">
			{job.company.name} ·
			<span class="font-mono tabular-nums">
				{formatSalaryRange(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod)}
			</span>
			{#if job.responseSlaDays}
				· promises a reply within {job.responseSlaDays} days
			{/if}
		</p>
	</div>

	{#if applied}
		<Card>
			<div class="flex items-start gap-3">
				<Icon icon={icons.verified} class="mt-0.5 size-5 text-success" />
				<div class="flex flex-col gap-2">
					<p class="text-sm font-medium text-text">You have already applied</p>
					<p class="text-sm text-text-muted">
						You can follow where it stands from your applications.
					</p>
					<Button href="/me/applications" variant="primary" size="sm" class="mt-1 self-start">
						View my applications
					</Button>
				</div>
			</div>
		</Card>
	{:else}
		<Form form={applyToJob} enctype="multipart/form-data" class="flex flex-col gap-6">
			<FormError issues={applyToJob.fields.allIssues()} />

			<input {...applyToJob.fields.jobId.as('hidden', job.id)} />

			<Card title="Your resume">
				<div class="flex flex-col gap-4">
					{#if resumes.length > 0}
						<Field label="Use an existing resume">
							{#snippet children(control)}
								<Select
									{...control}
									bind:value={selectedResume}
									items={resumeOptions}
									name={applyToJob.fields.resumeDocumentId.as('select').name}
								/>
							{/snippet}
						</Field>
					{/if}

					{#if resumes.length === 0 || selectedResume === ''}
						<Field
							label="Upload a resume"
							issues={applyToJob.fields.resumeFile.issues()}
							hint="PDF, Word or plain text, under 10 MB."
						>
							{#snippet children(control)}
								<Input
									{...control}
									{...applyToJob.fields.resumeFile.as('file')}
									accept=".pdf,.doc,.docx,.txt"
									class="py-1.5"
								/>
							{/snippet}
						</Field>
					{/if}
				</div>
			</Card>

			<Card title="Anything else?" description="Optional, but it is read.">
				<Field label="Cover note" issues={applyToJob.fields.coverLetter.issues()}>
					{#snippet children(control)}
						<Textarea
							{...control}
							{...applyToJob.fields.coverLetter.as('text')}
							rows={8}
							placeholder="Why this role, and what you would bring to it."
						/>
					{/snippet}
				</Field>
			</Card>

			<FormActions>
				{#snippet aside()}
					<Button href="/jobs/{job.slug}" variant="secondary" size="lg">Back to the job</Button>
				{/snippet}
				<Button type="submit" variant="primary" size="lg" loading={applyToJob.pending > 0}>
					Send application
				</Button>
			</FormActions>
		</Form>
	{/if}
</div>
