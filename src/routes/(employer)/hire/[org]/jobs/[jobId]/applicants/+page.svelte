<script lang="ts">
	import { page } from '$app/state';
	import Badge, { type BadgeTone } from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Markdown from '#lib/components/ui/Markdown.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import { toast } from '#lib/components/ui/toast.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime, label } from '#lib/utils/format';
	import {
		advanceApplication,
		listApplicants,
		markViewed,
		rejectApplication
	} from '../../../applicants.remote';
	import { getJob } from '../../../jobs.remote';

	const orgSlug = $derived(page.params.org ?? '');
	const jobId = $derived(page.params.jobId ?? '');

	const job = $derived(await getJob({ orgSlug, jobId }));
	const applicants = $derived(await listApplicants({ orgSlug, jobId }));

	const STATUS_TONE: Record<string, BadgeTone> = {
		submitted: 'neutral',
		in_review: 'info',
		interviewing: 'accent',
		offered: 'success',
		hired: 'success',
		rejected: 'danger',
		withdrawn: 'neutral'
	};

	/** What the employer can move this application to next. */
	const NEXT: Record<string, ('in_review' | 'interviewing' | 'offered' | 'hired')[]> = {
		submitted: ['in_review', 'interviewing'],
		in_review: ['interviewing', 'offered'],
		interviewing: ['offered'],
		offered: ['hired'],
		hired: [],
		rejected: [],
		withdrawn: []
	};

	const DAY = 24 * 60 * 60 * 1000;

	/** Days this person has been waiting on a first reply. */
	function waitingDays(application: (typeof applicants)[number]): number | null {
		if (application.firstRespondedAt) return null;
		if (['rejected', 'withdrawn', 'hired'].includes(application.status)) return null;
		return Math.floor((Date.now() - application.createdAt.getTime()) / DAY);
	}

	let working = $state<string | null>(null);
	let rejecting = $state<(typeof applicants)[number] | null>(null);
	let rejectionReason = $state('');

	async function advance(
		applicationId: string,
		status: 'in_review' | 'interviewing' | 'offered' | 'hired'
	) {
		working = applicationId;
		try {
			await advanceApplication({ orgSlug, applicationId, jobId, status });
			toast.success(`Moved to ${label(status).toLowerCase()}.`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not update.');
		} finally {
			working = null;
		}
	}

	async function confirmRejection() {
		if (!rejecting) return;
		working = rejecting.id;
		try {
			await rejectApplication({
				orgSlug,
				applicationId: rejecting.id,
				jobId,
				reason: rejectionReason.trim()
			});
			toast.success('Candidate notified.');
			rejecting = null;
			rejectionReason = '';
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not reject.');
		} finally {
			working = null;
		}
	}
</script>

<svelte:head><title>Applicants · {job.title} · Fann</title></svelte:head>

<div class="mx-auto flex max-w-4xl flex-col gap-6 p-(--fann-space-page)">
	<div class="flex flex-col gap-1">
		<nav class="text-xs text-text-subtle">
			<a href="/hire/{orgSlug}/jobs" class="underline-offset-2 hover:text-text hover:underline">
				Jobs
			</a>
			<span aria-hidden="true"> / </span>
			<a
				href="/hire/{orgSlug}/jobs/{jobId}"
				class="underline-offset-2 hover:text-text hover:underline"
			>
				{job.title}
			</a>
		</nav>
		<h1 class="text-2xl text-text">Applicants</h1>
	</div>

	{#if applicants.length === 0}
		<EmptyState
			title="Nobody has applied yet"
			description="Applications will appear here as they arrive."
		>
			{#snippet icon()}<Icon icon={icons.candidates} class="size-6" />{/snippet}
		</EmptyState>
	{:else}
		<div class="border border-border">
			{#each applicants as applicant (applicant.id)}
				{@const waiting = waitingDays(applicant)}
				{@const overdue =
					waiting !== null && job.responseSlaDays !== null && waiting > job.responseSlaDays}
				<article
					class="flex flex-col gap-3 border-b border-border bg-surface p-(--fann-space-panel) last:border-b-0"
				>
					<div class="flex items-start justify-between gap-4">
						<div class="flex min-w-0 flex-col gap-0.5">
							<h2 class="text-base font-medium text-text">{applicant.candidateName}</h2>
							<a
								href="mailto:{applicant.candidateEmail}"
								class="w-fit text-sm text-text-muted underline-offset-2 hover:text-text hover:underline"
							>
								{applicant.candidateEmail}
							</a>
						</div>

						<div class="flex shrink-0 items-center gap-2">
							<Badge tone={STATUS_TONE[applicant.status]} dot>{label(applicant.status)}</Badge>
						</div>
					</div>

					<div class="flex flex-wrap items-center gap-3 text-xs">
						<span class="text-text-subtle">
							Applied {formatRelativeTime(applicant.createdAt)}
						</span>

						{#if waiting !== null}
							<!-- Shown to the employer too, so the promise is visible on both sides. -->
							<span class={overdue ? 'flex items-center gap-1.5 text-warning' : 'text-text-subtle'}>
								{#if overdue}
									<Icon icon={icons.warning} class="size-3.5" />
									Waiting {waiting} days — you promised {job.responseSlaDays}
								{:else}
									Waiting {waiting} day{waiting === 1 ? '' : 's'}
								{/if}
							</span>
						{/if}

						{#if applicant.resumeDocumentId}
							<a
								href="/files/{applicant.resumeDocumentId}"
								class="flex items-center gap-1.5 text-text-accent underline-offset-2 hover:underline"
								onclick={() => markViewed({ orgSlug, applicationId: applicant.id })}
							>
								<Icon icon={icons.preview} class="size-3.5" />
								Resume
							</a>
						{/if}
					</div>

					{#if applicant.coverLetter}
						<Markdown source={applicant.coverLetter} class="border-l-2 border-border pl-3" />
					{/if}

					{#if NEXT[applicant.status].length > 0}
						<div class="flex flex-wrap items-center gap-2">
							{#each NEXT[applicant.status] as next (next)}
								<Button
									size="sm"
									variant={next === 'hired' ? 'primary' : 'secondary'}
									loading={working === applicant.id}
									onclick={() => advance(applicant.id, next)}
								>
									Move to {label(next).toLowerCase()}
								</Button>
							{/each}

							<Button
								size="sm"
								variant="ghost"
								onclick={() => {
									rejecting = applicant;
									rejectionReason = '';
								}}
							>
								Reject
							</Button>
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</div>

<!--
	Rejection requires a reason, and the reason reaches the candidate. Making this
	the only path to "no" is the point — silence is what this product is against.
-->
<Dialog
	open={rejecting !== null}
	title="Reject {rejecting?.candidateName ?? ''}"
	description="They will see this reason. Write something you would be comfortable reading."
	size="md"
>
	<Textarea
		bind:value={rejectionReason}
		rows={5}
		placeholder="We went with someone who has more experience with distributed systems."
	/>

	{#snippet footer()}
		<Button onclick={() => (rejecting = null)}>Cancel</Button>
		<Button
			variant="danger"
			disabled={rejectionReason.trim().length === 0}
			loading={working === rejecting?.id}
			onclick={confirmRejection}
		>
			Reject and notify
		</Button>
	{/snippet}
</Dialog>
