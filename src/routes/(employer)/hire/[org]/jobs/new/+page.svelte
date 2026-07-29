<script lang="ts">
	import { page } from '$app/state';
	import JobForm from '#lib/components/app/JobForm.svelte';
	import { createJob } from '../../jobs.remote';

	const orgSlug = $derived(page.params.org ?? '');
</script>

<svelte:head><title>Post a job · Fann</title></svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-(--fann-space-page)">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl text-text">Post a job</h1>
		<p class="text-sm text-text-muted">
			Saved as a draft first — nothing goes public until you publish it.
		</p>
	</div>

	<JobForm form={createJob} {orgSlug} submitLabel="Save draft" />
</div>
