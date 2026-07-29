<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Badge, { type BadgeTone } from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Table from '#lib/components/ui/Table.svelte';
	import PageSkeleton from '#lib/components/app/PageSkeleton.svelte';
	import Skeleton from '#lib/components/ui/Skeleton.svelte';
	import Td from '#lib/components/ui/Td.svelte';
	import Th from '#lib/components/ui/Th.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime, label } from '#lib/utils/format';
	import { listOrgApplicants } from '../applicants.remote';

	const orgSlug = $derived(page.params.org ?? '');

	// Filter state lives in the URL: a shortlist worth sharing with a colleague is
	// a link, and the back button does what people expect.
	const params = $derived(page.url.searchParams);
	const search = $derived(params.get('q') ?? '');
	const status = $derived(params.get('status') ?? '');
	const waitingOnly = $derived(params.get('waiting') === '1');

	const applicants = $derived(
		await listOrgApplicants({
			orgSlug,
			search: search || undefined,
			status: (status || undefined) as never,
			waitingOnly: waitingOnly || undefined
		})
	);

	const STATUS_TONE: Record<string, BadgeTone> = {
		submitted: 'neutral',
		in_review: 'info',
		interviewing: 'accent',
		offered: 'success',
		hired: 'success',
		rejected: 'danger',
		withdrawn: 'neutral'
	};

	const STATUS_OPTIONS = [
		{ value: '', label: 'Any status' },
		{ value: 'submitted', label: 'Submitted' },
		{ value: 'in_review', label: 'In review' },
		{ value: 'interviewing', label: 'Interviewing' },
		{ value: 'offered', label: 'Offered' },
		{ value: 'hired', label: 'Hired' },
		{ value: 'rejected', label: 'Turned down' },
		{ value: 'withdrawn', label: 'Withdrawn' }
	];

	function update(mutate: (next: URLSearchParams) => void) {
		// A throwaway builder, serialized into the `goto` on the next line and never
		// read again, so it needs no reactivity of its own.
		const next = new URLSearchParams(params.toString());
		mutate(next);
		goto(`/hire/${orgSlug}/candidates?${next}`, { keepFocus: true, noScroll: true });
	}

	// Writable derived: tracks the URL, but the user can type over it freely.
	let term = $derived(search);

	/** How long someone has been waiting on a first reply. */
	function waitingDays(createdAt: Date): number {
		return Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
	}
</script>

<svelte:head><title>Candidates · Fann</title></svelte:head>

<svelte:boundary>
	{#snippet pending()}
		<PageSkeleton>
			<Skeleton height="2.5rem" />
			<div class="flex flex-col gap-px">
				{#each { length: 8 }, row (row)}
					<Skeleton height="3.25rem" />
				{/each}
			</div>
		</PageSkeleton>
	{/snippet}

	<div class="flex flex-col gap-6 p-(--fann-space-page)">
		<div class="flex flex-col gap-1">
			<h1 class="text-2xl text-text">Candidates</h1>
			<p class="text-sm text-text-muted">
				Everyone who has applied to any of your jobs. Newest first, unless you are looking at who is
				still waiting.
			</p>
		</div>

		<form
			class="flex flex-wrap items-center gap-3"
			onsubmit={(event) => {
				event.preventDefault();
				update((next) => {
					if (term.trim()) next.set('q', term.trim());
					else next.delete('q');
				});
			}}
		>
			<div class="relative min-w-64 flex-1">
				<Icon
					icon={icons.search}
					class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle"
				/>
				<Input
					bind:value={term}
					class="pl-9"
					placeholder="Name, email or job title"
					aria-label="Search candidates"
				/>
			</div>

			<Select
				value={status}
				items={STATUS_OPTIONS}
				class="w-44"
				onValueChange={(next: string) =>
					update((params) => (next ? params.set('status', next) : params.delete('status')))}
			/>

			<!--
				The filter this product exists for. Sorting flips to oldest-first here,
				because in this mode the list is a queue and the person at the top has been
				waiting longest.
			-->
			<Button
				variant={waitingOnly ? 'primary' : 'secondary'}
				onclick={() =>
					update((params) => (waitingOnly ? params.delete('waiting') : params.set('waiting', '1')))}
			>
				<Icon icon={icons.time} class="size-3.5" />
				Waiting on a reply
			</Button>
		</form>

		{#if applicants.length === 0}
			<EmptyState
				title="Nobody matches that"
				description="Try a broader search, or clear the filters."
			>
				{#snippet icon()}<Icon icon={icons.candidates} class="size-6" />{/snippet}
				{#snippet action()}
					<Button href="/hire/{orgSlug}/candidates" size="sm">Clear filters</Button>
				{/snippet}
			</EmptyState>
		{:else}
			<Table label="Candidates who have applied to your jobs">
				{#snippet head()}
					<tr>
						<Th>Candidate</Th>
						<Th>Job</Th>
						<Th>Status</Th>
						<Th align="right">Waiting</Th>
						<Th align="right">Applied</Th>
					</tr>
				{/snippet}

				{#each applicants as applicant (applicant.id)}
					<tr class="hover:bg-surface-hover">
						<Td>
							<a
								href="/hire/{orgSlug}/applications/{applicant.id}"
								class="flex flex-col gap-0.5 underline-offset-2 hover:underline"
							>
								<span class="text-sm font-medium text-text">{applicant.candidateName}</span>
								<span class="text-xs text-text-subtle">{applicant.candidateEmail}</span>
							</a>
						</Td>
						<Td>
							<a
								href="/hire/{orgSlug}/jobs/{applicant.jobId}/pipeline"
								class="text-sm text-text-muted underline-offset-2 hover:text-text hover:underline"
							>
								{applicant.jobTitle}
							</a>
						</Td>
						<Td>
							<Badge tone={STATUS_TONE[applicant.status]}>{label(applicant.status)}</Badge>
						</Td>
						<Td align="right">
							{#if applicant.firstRespondedAt}
								<span class="text-xs text-text-subtle">Replied</span>
							{:else}
								{@const days = waitingDays(applicant.createdAt)}
								<Badge tone={days >= 7 ? 'warning' : 'neutral'}>{days}d</Badge>
							{/if}
						</Td>
						<Td align="right" class="text-text-muted">
							{formatRelativeTime(applicant.createdAt)}
						</Td>
					</tr>
				{/each}
			</Table>
		{/if}
	</div>
</svelte:boundary>
