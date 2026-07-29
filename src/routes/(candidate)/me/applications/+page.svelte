<script lang="ts">
	import { page } from '$app/state';
	import CandidateOffer from '#lib/components/app/CandidateOffer.svelte';
	import Badge, { type BadgeTone } from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { toast } from '#lib/components/ui/toast.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime, formatSalaryRange, label } from '#lib/utils/format';
	import {
		myApplications,
		myOffers,
		respondToOffer,
		withdrawApplication
	} from '../../applications.remote';

	const applications = $derived(await myApplications());
	const justApplied = $derived(page.url.searchParams.has('applied'));

	// Keyed by application so each row can find its own without a nested search.
	const offers = $derived(new Map((await myOffers()).map((offer) => [offer.applicationId, offer])));

	const STATUS_TONE: Record<string, BadgeTone> = {
		submitted: 'neutral',
		in_review: 'info',
		interviewing: 'accent',
		offered: 'success',
		hired: 'success',
		rejected: 'danger',
		withdrawn: 'neutral'
	};

	const DAY = 24 * 60 * 60 * 1000;

	/**
	 * How long the candidate has been waiting, and whether the employer has broken
	 * the promise printed on the listing. Saying this out loud is the entire point —
	 * everywhere else, silence is indistinguishable from rejection.
	 */
	function waiting(application: (typeof applications)[number]) {
		if (application.firstRespondedAt) return null;
		if (['withdrawn', 'rejected', 'hired'].includes(application.status)) return null;

		const days = Math.floor((Date.now() - application.createdAt.getTime()) / DAY);
		const overdue = application.responseSlaDays !== null && days > application.responseSlaDays;

		return { days, overdue };
	}

	let working = $state<string | null>(null);
	let deciding = $state<string | null>(null);

	async function respond(offerId: string, decision: 'accepted' | 'declined') {
		deciding = offerId;
		try {
			await respondToOffer({ offerId, decision });
			toast.success(
				decision === 'accepted' ? 'Offer accepted. Congratulations.' : 'Offer declined.'
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not send your answer.');
		} finally {
			deciding = null;
		}
	}

	async function withdraw(id: string, title: string) {
		working = id;
		try {
			await withdrawApplication(id);
			toast.success(`Withdrawn from ${title}.`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not withdraw.');
		} finally {
			working = null;
		}
	}
</script>

<svelte:head><title>My applications · Fann</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl text-text">Applications</h1>
		<p class="text-sm text-text-muted">
			Where every application stands, including the ones nobody has answered.
		</p>
	</div>

	{#if justApplied}
		<p
			class="flex items-center gap-2 border border-success/25 bg-success-subtle px-3 py-2 text-sm text-success"
		>
			<Icon icon={icons.verified} class="size-4" />
			Application submitted.
		</p>
	{/if}

	{#if applications.length === 0}
		<EmptyState
			title="No applications yet"
			description="When you apply for a role it will appear here, with its status."
		>
			{#snippet icon()}<Icon icon={icons.jobs} class="size-6" />{/snippet}
			{#snippet action()}
				<Button href="/jobs" variant="primary" size="sm">Browse jobs</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="border border-border">
			{#each applications as application (application.id)}
				{@const wait = waiting(application)}
				{@const offer = offers.get(application.id)}
				<article
					class="flex flex-col gap-3 border-b border-border bg-surface p-(--fann-space-panel) last:border-b-0"
				>
					<div class="flex items-start justify-between gap-4">
						<div class="flex min-w-0 flex-col gap-1">
							<h2 class="text-base font-medium text-text">
								<a href="/jobs/{application.jobSlug}" class="hover:text-text-accent">
									{application.jobTitle}
								</a>
							</h2>
							<p class="text-sm text-text-muted">{application.companyName}</p>
						</div>

						<div class="flex shrink-0 flex-col items-end gap-1">
							<Badge tone={STATUS_TONE[application.status]} dot>
								{label(application.status)}
							</Badge>
							<p class="font-mono text-xs text-text-subtle tabular-nums">
								{formatSalaryRange(
									application.salaryMin,
									application.salaryMax,
									application.salaryCurrency,
									application.salaryPeriod
								)}
							</p>
						</div>
					</div>

					<div class="flex flex-wrap items-center gap-3 text-xs">
						<span class="text-text-subtle">
							Applied {formatRelativeTime(application.createdAt)}
						</span>

						{#if wait}
							<span
								class="flex items-center gap-1.5 {wait.overdue
									? 'text-warning'
									: 'text-text-subtle'}"
							>
								<Icon icon={wait.overdue ? icons.warning : icons.time} class="size-3.5" />
								{#if wait.overdue}
									No reply in {wait.days} days — they promised {application.responseSlaDays}
								{:else}
									Waiting {wait.days} day{wait.days === 1 ? '' : 's'}
									{#if application.responseSlaDays}
										of {application.responseSlaDays}
									{/if}
								{/if}
							</span>
						{:else if application.firstRespondedAt}
							<span class="flex items-center gap-1.5 text-success">
								<Icon icon={icons.verified} class="size-3.5" />
								Replied {formatRelativeTime(application.firstRespondedAt)}
							</span>
						{/if}

						{#if application.rejectionReason}
							<span class="text-text-muted">— {application.rejectionReason}</span>
						{/if}

						<div class="flex-1"></div>

						{#if ['submitted', 'in_review', 'interviewing', 'offered'].includes(application.status)}
							<Button
								size="xs"
								variant="ghost"
								loading={working === application.id}
								onclick={() => withdraw(application.id, application.jobTitle)}
							>
								Withdraw
							</Button>
						{/if}
					</div>

					{#if offer}
						<!--
							Inside the row rather than in a separate list, because an offer only
							means anything next to the job it is for. The email we send points
							here, so this is the page that has to be able to answer it.
						-->
						<CandidateOffer
							{offer}
							jobTitle={application.jobTitle}
							companyName={application.companyName}
							busy={deciding === offer.id}
							onrespond={(decision) => respond(offer.id, decision)}
						/>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</div>
