<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import Badge, { type BadgeTone } from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import InterviewPanel from '#lib/components/app/ats/InterviewPanel.svelte';
	import OfferPanel from '#lib/components/app/ats/OfferPanel.svelte';
	import ScorecardPanel from '#lib/components/app/ats/ScorecardPanel.svelte';
	import PageSkeleton from '#lib/components/app/PageSkeleton.svelte';
	import Skeleton from '#lib/components/ui/Skeleton.svelte';
	import TagStrip from '#lib/components/app/ats/TagStrip.svelte';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Markdown from '#lib/components/ui/Markdown.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import { toast } from '#lib/components/ui/toast.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime, label } from '#lib/utils/format';
	import {
		addNote,
		addTag,
		cancelInterview,
		changeOfferStatus,
		deleteNote,
		draftOffer,
		getApplication,
		removeTag,
		saveScorecard,
		scheduleInterview,
		viewApplication
	} from '../../application.remote';
	import { moveCard } from '../../pipeline.remote';

	const orgSlug = $derived(page.params.org ?? '');
	const applicationId = $derived(page.params.applicationId ?? '');

	const data = $derived(await getApplication({ orgSlug, applicationId }));
	const application = $derived(data.application);

	const canNote = $derived(data.role !== 'viewer');
	// Interviewers score but cannot decide. That asymmetry is the role's whole point.
	const canScore = $derived(data.role !== 'viewer');
	const canSchedule = $derived(
		['owner', 'admin', 'recruiter', 'hiring_manager'].includes(data.role)
	);
	const canDraftOffer = $derived(canSchedule);
	// Drafting an offer is a suggestion; sending one is a commitment. Different roles.
	const canSendOffer = $derived(['owner', 'admin'].includes(data.role));
	const canMove = $derived(!['viewer', 'interviewer'].includes(data.role));

	const STATUS_TONE: Record<string, BadgeTone> = {
		submitted: 'neutral',
		in_review: 'info',
		interviewing: 'accent',
		offered: 'success',
		hired: 'success',
		rejected: 'danger',
		withdrawn: 'neutral'
	};

	/*
	 * Record the view once.
	 *
	 * A remote `command` inside a tracked `$effect` re-runs forever: the call
	 * registers a dependency on its own state, which the call then changes. The
	 * `untrack` plus the ran-once guard is the documented shape for this — see the
	 * known traps in CLAUDE.md.
	 */
	let recorded = $state(false);
	$effect(() => {
		const id = applicationId;
		if (!id || recorded) return;
		recorded = true;
		untrack(() => {
			void viewApplication({ orgSlug, applicationId: id }).catch(() => {
				// A missing view record is not worth interrupting the page for.
			});
		});
	});

	/* Notes ---------------------------------------------------------------- */

	let draft = $state('');
	let working = $state(false);
	let removing = $state<{ id: string } | null>(null);

	async function submitNote() {
		working = true;
		try {
			await addNote({ orgSlug, applicationId, body: draft });
			draft = '';
			toast.success('Note added.');
		} catch (failure) {
			toast.error(failure instanceof Error ? failure.message : 'Could not save that note.');
		} finally {
			working = false;
		}
	}

	async function confirmRemove() {
		if (!removing) return;
		working = true;
		try {
			await deleteNote({ orgSlug, applicationId, noteId: removing.id }).updates(
				withoutNote(removing.id)
			);
			removing = null;
			toast.success('Note deleted.');
		} catch (failure) {
			toast.error(failure instanceof Error ? failure.message : 'Could not delete that note.');
		} finally {
			working = false;
		}
	}

	/* Moving --------------------------------------------------------------- */

	const stageOptions = $derived(
		data.stages
			.filter((stage) => stage.id !== application.currentStageId)
			.map((stage) => ({ value: stage.id, label: stage.name }))
	);

	const currentStage = $derived(
		data.stages.find((stage) => stage.id === application.currentStageId)
	);

	async function move(toStageId: string) {
		const stage = data.stages.find((candidate) => candidate.id === toStageId);

		// Rejection needs a reason, and the reason belongs with the board's dialog
		// rather than a second copy of it here. Send them there instead of building a
		// path that could reject without asking.
		if (stage?.kind === 'rejected') {
			toast.info('Turning someone down asks for a reason — do it from the board.');
			return;
		}

		working = true;
		try {
			await moveCard({ orgSlug, jobId: application.jobId, applicationId, toStageId });
			await getApplication({ orgSlug, applicationId }).refresh();
			toast.success(`Moved to ${stage?.name ?? 'the next stage'}.`);
		} catch (failure) {
			toast.error(failure instanceof Error ? failure.message : 'That move did not go through.');
		} finally {
			working = false;
		}
	}

	async function submitScorecard(input: {
		overall?: number;
		summary?: string;
		ratings: { criterionId: string; rating: number; comment?: string }[];
		submit?: boolean;
	}) {
		working = true;
		try {
			const result = await saveScorecard({ orgSlug, applicationId, ...input });
			toast.success(result.submitted ? 'Scorecard submitted.' : 'Draft saved.');
		} catch (failure) {
			toast.error(failure instanceof Error ? failure.message : 'Could not save that scorecard.');
		} finally {
			working = false;
		}
	}

	/**
	 * One wrapper for every panel action.
	 *
	 * They all do the same three things — flip `working`, surface the failure as a
	 * toast, and let the command's own `refresh` update the page. Repeating that
	 * five times is how one of them quietly stops reporting errors.
	 */
	async function run(action: () => Promise<unknown>, success: string) {
		working = true;
		try {
			await action();
			toast.success(success);
		} catch (failure) {
			toast.error(failure instanceof Error ? failure.message : 'That did not go through.');
		} finally {
			working = false;
		}
	}

	/**
	 * Optimistic overrides for the two removals on this page.
	 *
	 * Only removals. Adding a note or a tag needs an id and a timestamp the server
	 * has not issued yet, and inventing them means the row visibly changes identity
	 * a moment later — worse than a short wait. Taking something away needs nothing
	 * from the server to look right.
	 */
	const query = $derived(getApplication({ orgSlug, applicationId }));

	const withoutNote = (noteId: string) =>
		query.withOverride((data) => ({
			...data,
			notes: data.notes.filter((note) => note.id !== noteId)
		}));

	const withoutTag = (tagId: string) =>
		query.withOverride((data) => ({
			...data,
			tags: data.tags.filter((tag) => tag.id !== tagId)
		}));

	/** What a timeline row says, in the employer's language rather than the schema's. */
	function describe(event: (typeof data.timeline)[number]): string {
		const payload = (event.payload ?? {}) as { to?: string; stage?: string };

		switch (event.type) {
			case 'submitted':
				return 'Applied';
			case 'viewed':
				return `${event.actorName ?? 'Someone'} opened the application`;
			case 'note_added':
				return `${event.actorName ?? 'Someone'} left a note`;
			case 'status_changed':
				return payload.stage
					? `Moved to ${payload.stage} by ${event.actorName ?? 'someone'}`
					: `Status changed to ${label(payload.to ?? '')}`;
			case 'email_sent':
				return 'Email sent to the candidate';
			case 'withdrawn':
				return 'The candidate withdrew';
			default:
				return label(event.type);
		}
	}
</script>

<svelte:head><title>{application.candidateName} · {application.jobTitle}</title></svelte:head>

<svelte:boundary>
	{#snippet pending()}
		<PageSkeleton>
			<div class="grid gap-6 lg:grid-cols-[1fr_22rem]">
				<Skeleton height="30rem" />
				<div class="flex flex-col gap-6">
					<Skeleton height="9rem" />
					<Skeleton height="9rem" />
					<Skeleton height="14rem" />
				</div>
			</div>
		</PageSkeleton>
	{/snippet}

	<div class="flex flex-col gap-6 p-(--fann-space-page)">
		<!-- Header ------------------------------------------------------------- -->
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div class="flex flex-col gap-1.5">
				<a
					href="/hire/{orgSlug}/jobs/{application.jobId}/pipeline"
					class="flex items-center gap-1.5 text-xs text-text-muted hover:text-text"
				>
					<Icon icon={icons.chevronLeft} class="size-3" />
					{application.jobTitle}
				</a>
				<h1 class="text-2xl text-text">{application.candidateName}</h1>
				<a
					href="mailto:{application.candidateEmail}"
					class="text-sm text-text-accent underline-offset-2 hover:underline"
				>
					{application.candidateEmail}
				</a>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<Badge tone={STATUS_TONE[application.status]}>{label(application.status)}</Badge>
				{#if currentStage}
					<Badge icon={icons.pipeline}>{currentStage.name}</Badge>
				{/if}
				{#if canMove && stageOptions.length > 0}
					<Select
						items={stageOptions}
						size="sm"
						placeholder="Move to…"
						class="w-44"
						disabled={working}
						onValueChange={move}
					/>
				{/if}
			</div>
		</div>

		<TagStrip
			tags={data.tags}
			canEdit={canNote}
			{working}
			onadd={(name) => run(() => addTag({ orgSlug, applicationId, name }), 'Tag added.')}
			onremove={(tagId) =>
				run(
					() => removeTag({ orgSlug, applicationId, tagId }).updates(withoutTag(tagId)),
					'Tag removed.'
				)}
		/>

		<div class="grid gap-6 lg:grid-cols-[1fr_22rem]">
			<!-- CV and cover letter -------------------------------------------- -->
			<div class="flex min-w-0 flex-col gap-6">
				{#if application.resumeDocumentId}
					<section class="flex flex-col border border-border bg-surface">
						<header
							class="flex items-center justify-between gap-3 border-b border-dashed border-border p-(--fann-space-panel)"
						>
							<h2 class="flex items-center gap-2 text-sm font-medium text-text">
								<Icon icon={icons.document} class="size-4 text-text-muted" />
								CV
							</h2>
							<Button href="/files/{application.resumeDocumentId}" size="sm" target="_blank">
								Open in a new tab
								<Icon icon={icons.externalLink} class="size-3.5" />
							</Button>
						</header>

						<!--
							An `<iframe>` rather than an inline PDF renderer: the file is an
							arbitrary upload from a stranger, and the browser's own viewer is
							sandboxed far more thoroughly than anything we would assemble. The
							route behind it re-checks authorization on every request and refuses
							anything a scanner has not cleared.
						-->
						<iframe
							src="/files/{application.resumeDocumentId}"
							title="CV for {application.candidateName}"
							class="h-[42rem] w-full border-0 bg-surface-sunken"
						></iframe>
					</section>
				{:else}
					<section
						class="flex items-center gap-3 border border-dashed border-border p-(--fann-space-panel) text-sm text-text-muted"
					>
						<Icon icon={icons.info} class="size-4 shrink-0 text-text-subtle" />
						No CV was attached to this application.
					</section>
				{/if}

				{#if application.coverLetter}
					<section class="flex flex-col border border-border bg-surface">
						<h2
							class="border-b border-dashed border-border p-(--fann-space-panel) text-sm font-medium text-text"
						>
							What they wrote
						</h2>
						<div class="p-(--fann-space-panel)">
							<Markdown source={application.coverLetter} />
						</div>
					</section>
				{/if}
			</div>

			<!-- Notes and history ----------------------------------------------- -->
			<div class="flex flex-col gap-6">
				<InterviewPanel
					interviews={data.interviews}
					calendarHref={(interviewId) => `/hire/${orgSlug}/interviews/${interviewId}.ics`}
					{canSchedule}
					{working}
					onschedule={(input) =>
						run(
							() => scheduleInterview({ orgSlug, applicationId, ...input }),
							'Scheduled, and the candidate has been told.'
						)}
					oncancel={(interviewId) =>
						run(
							() => cancelInterview({ orgSlug, applicationId, interviewId }),
							'Cancelled, and the candidate has been told.'
						)}
				/>

				<OfferPanel
					offers={data.offers}
					canDraft={canDraftOffer}
					canSend={canSendOffer}
					{working}
					ondraft={(input) =>
						run(() => draftOffer({ orgSlug, applicationId, ...input }), 'Draft saved.')}
					onstatus={(offerId, status) =>
						run(
							() => changeOfferStatus({ orgSlug, applicationId, offerId, status }),
							status === 'sent' ? 'Offer sent.' : 'Offer updated.'
						)}
				/>

				<ScorecardPanel
					criteria={data.panel.criteria}
					mine={data.panel.mine}
					others={data.panel.others}
					othersSubmittedCount={data.panel.othersSubmittedCount}
					hiddenUntilYouSubmit={data.panel.hiddenUntilYouSubmit}
					{canScore}
					{working}
					onsave={submitScorecard}
				/>

				<section class="flex flex-col border border-border bg-surface">
					<header class="flex flex-col gap-1 border-b border-dashed border-border p-4">
						<h2 class="text-sm font-medium text-text">Notes</h2>
						<!-- Said on the page, not just enforced in the service. Somebody has to
						     believe it before they will write anything worth reading. -->
						<p class="text-xs text-text-subtle">Only your team sees these. Never the candidate.</p>
					</header>

					{#if canNote}
						<div class="flex flex-col gap-3 border-b border-dashed border-border p-4">
							<Textarea
								bind:value={draft}
								rows={3}
								placeholder="Strong on the systems questions, thin on the product side…"
								aria-label="Add a note"
							/>
							<Button
								variant="primary"
								size="sm"
								class="self-end"
								loading={working}
								disabled={draft.trim().length === 0}
								onclick={submitNote}
							>
								Add note
							</Button>
						</div>
					{/if}

					{#if data.notes.length === 0}
						<p class="p-4 text-xs text-text-subtle">Nothing yet.</p>
					{:else}
						<ul class="flex flex-col">
							{#each data.notes as note (note.id)}
								<li class="flex flex-col gap-2 border-b border-border p-4 last:border-b-0">
									<div class="flex items-baseline justify-between gap-2">
										<span class="text-xs font-medium text-text">
											{note.author?.name ?? 'Someone who has left'}
										</span>
										<time class="text-2xs text-text-subtle" datetime={note.createdAt.toISOString()}>
											{formatRelativeTime(note.createdAt)}
										</time>
									</div>
									<p class="text-sm whitespace-pre-wrap text-text-muted">{note.body}</p>

									{#if canNote}
										<button
											type="button"
											class="self-start text-2xs text-text-subtle underline-offset-2 hover:text-danger hover:underline"
											onclick={() => (removing = { id: note.id })}
										>
											Delete
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				<section class="flex flex-col border border-border bg-surface">
					<header class="flex flex-col gap-1 border-b border-dashed border-border p-4">
						<h2 class="text-sm font-medium text-text">History</h2>
						<p class="text-xs text-text-subtle">
							Everything that happened. Rows marked <em>shared</em> also appear on the candidate's own
							page.
						</p>
					</header>

					<ol class="flex flex-col">
						{#each data.timeline as event (event.id)}
							<li class="flex flex-col gap-1 border-b border-border p-4 last:border-b-0">
								<div class="flex items-baseline justify-between gap-2">
									<span class="text-sm text-text">{describe(event)}</span>
									{#if event.visibleToCandidate}
										<Badge tone="info">shared</Badge>
									{/if}
								</div>
								<time class="text-2xs text-text-subtle" datetime={event.createdAt.toISOString()}>
									{formatRelativeTime(event.createdAt)}
								</time>
							</li>
						{/each}
					</ol>
				</section>
			</div>
		</div>
	</div>
</svelte:boundary>

<ConfirmDialog
	open={removing !== null}
	title="Delete this note?"
	description="It disappears from this application's notes for everyone on your team."
	detail="The fact that a note was left stays in the history — what it said does not."
	confirmLabel="Delete note"
	loading={working}
	onconfirm={confirmRemove}
	oncancel={() => (removing = null)}
/>
