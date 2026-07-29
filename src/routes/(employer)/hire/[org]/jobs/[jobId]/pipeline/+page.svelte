<script lang="ts">
	import { page } from '$app/state';
	import { SvelteSet } from 'svelte/reactivity';
	import BoardSkeleton from '#lib/components/app/ats/BoardSkeleton.svelte';
	import PageSkeleton from '#lib/components/app/PageSkeleton.svelte';
	import CandidateCard from '#lib/components/app/ats/CandidateCard.svelte';
	import StageColumn from '#lib/components/app/ats/StageColumn.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import FormActions from '#lib/components/ui/FormActions.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import { toast } from '#lib/components/ui/toast.svelte';
	import { icons } from '#lib/design/icons';
	import {
		addStage,
		deleteStage,
		getBoard,
		moveCard,
		moveMany,
		renameStage,
		reorderStages
	} from '../../../pipeline.remote';
	import { getJob } from '../../../jobs.remote';

	const orgSlug = $derived(page.params.org ?? '');
	const jobId = $derived(page.params.jobId ?? '');

	const job = $derived(await getJob({ orgSlug, jobId }));
	const data = $derived(await getBoard({ orgSlug, jobId }));

	const canMove = $derived(data.role !== 'viewer' && data.role !== 'interviewer');
	const canManage = $derived(['owner', 'admin', 'recruiter'].includes(data.role));

	/** Cards grouped by column. A card with no stage belongs in the first one. */
	const columns = $derived(
		data.stages.map((stage, index) => ({
			stage,
			cards: data.cards.filter(
				(card) => card.stageId === stage.id || (card.stageId === null && index === 0)
			)
		}))
	);

	/* -----------------------------------------------------------------------
	   Moving
	   ----------------------------------------------------------------------- */

	let draggingId = $state<string | null>(null);
	let hoveredStageId = $state<string | null>(null);

	/**
	 * A move waiting on a rejection reason.
	 *
	 * Held rather than executed, because dropping a card into a rejecting column
	 * has to ask before it commits. The same rule is enforced in the service, so
	 * cancelling here is the only way out — there is no path that rejects silently.
	 */
	let pending = $state<{ applicationId: string; toStageId: string; name: string } | null>(null);
	let reason = $state('');
	let working = $state(false);

	function requestMove(applicationId: string, toStageId: string) {
		const stage = data.stages.find((candidate) => candidate.id === toStageId);
		if (!stage) return;

		const card = data.cards.find((candidate) => candidate.id === applicationId);
		if (!card || card.stageId === toStageId) return;

		if (stage.kind === 'rejected') {
			reason = '';
			pending = { applicationId, toStageId, name: card.candidateName };
			return;
		}

		void commitMove(applicationId, toStageId);
	}

	/**
	 * Paint the move before the server confirms it.
	 *
	 * `withOverride` shows the card in its new column immediately and releases the
	 * override when the command settles — so a failure puts it back where it was
	 * rather than leaving the board lying. Dragging a card and watching it sit still
	 * for 300ms reads as a broken drag, and people drag again.
	 */
	function optimisticMove(applicationIds: string[], toStageId: string) {
		const moving = new Set(applicationIds);

		return getBoard({ orgSlug, jobId }).withOverride((board) => ({
			...board,
			cards: board.cards.map((card) =>
				moving.has(card.id) ? { ...card, stageId: toStageId } : card
			)
		}));
	}

	async function commitMove(applicationId: string, toStageId: string, withReason?: string) {
		working = true;
		try {
			await moveCard({ orgSlug, jobId, applicationId, toStageId, reason: withReason }).updates(
				optimisticMove([applicationId], toStageId)
			);

			const stage = data.stages.find((candidate) => candidate.id === toStageId);
			toast.success(`Moved to ${stage?.name ?? 'the next stage'}.`);
			pending = null;
		} catch (failure) {
			// The override is already released, so the card is back where it started.
			toast.error(failure instanceof Error ? failure.message : 'That move did not go through.');
		} finally {
			working = false;
		}
	}

	/* -----------------------------------------------------------------------
	   Editing the columns
	   ----------------------------------------------------------------------- */

	let addingStage = $state(false);
	let newStageName = $state('');
	let newStageKind = $state('interview');

	const KIND_OPTIONS = [
		{ value: 'screening', label: 'Reviewing — the clock stops here' },
		{ value: 'interview', label: 'Interviewing' },
		{ value: 'offer', label: 'Offer made' },
		{ value: 'hired', label: 'Hired' },
		{ value: 'rejected', label: 'Turned down — asks you for a reason' }
	];

	async function submitStage() {
		working = true;
		try {
			await addStage({ orgSlug, jobId, name: newStageName, kind: newStageKind as never });
			addingStage = false;
			newStageName = '';
			toast.success('Stage added.');
		} catch (failure) {
			toast.error(failure instanceof Error ? failure.message : 'Could not add that stage.');
		} finally {
			working = false;
		}
	}

	/** The stage being renamed, and the name being typed for it. */
	let renaming = $state<{ id: string; original: string } | null>(null);
	let renamed = $state('');

	async function submitRename() {
		if (!renaming || renamed.trim() === renaming.original) {
			renaming = null;
			return;
		}

		working = true;
		try {
			await renameStage({ orgSlug, jobId, stageId: renaming.id, name: renamed });
			renaming = null;
			toast.success('Stage renamed.');
		} catch (failure) {
			toast.error(failure instanceof Error ? failure.message : 'Could not rename that stage.');
		} finally {
			working = false;
		}
	}

	/* -----------------------------------------------------------------------
	   Bulk selection
	   ----------------------------------------------------------------------- */

	/**
	 * Selection is off until somebody turns it on.
	 *
	 * Checkboxes on every card by default make a board of forty people look like a
	 * spreadsheet, and the common case is moving one person. `SvelteSet` because
	 * this is reactive state that the template reads.
	 */
	let selecting = $state(false);
	let selected = new SvelteSet<string>();

	function toggleSelected(id: string, on: boolean) {
		if (on) selected.add(id);
		else selected.delete(id);
	}

	function clearSelection() {
		selected.clear();
		selecting = false;
	}

	/** Where a bulk move is headed, held while the target is chosen. */
	let bulkStageId = $state('');

	async function runBulk(toStageId: string, withReason?: string) {
		working = true;
		try {
			const ids = [...selected];

			const result = await moveMany({
				orgSlug,
				jobId,
				applicationIds: ids,
				toStageId,
				reason: withReason
			}).updates(optimisticMove(ids, toStageId));

			// Named rather than counted: "3 did not move" leaves somebody scrolling the
			// board trying to work out which three.
			if (result.failed.length > 0) {
				toast.warning(
					`Moved ${result.moved.length}. ${result.failed.length} did not: ${result.failed[0].reason}`
				);
			} else {
				toast.success(`Moved ${result.moved.length}.`);
			}

			clearSelection();
			bulkPending = null;
		} catch (failure) {
			toast.error(failure instanceof Error ? failure.message : 'That did not go through.');
		} finally {
			working = false;
		}
	}

	/** A bulk move into a rejecting column, waiting on its reason. */
	let bulkPending = $state<{ toStageId: string; name: string } | null>(null);

	function requestBulkMove(toStageId: string) {
		const stage = data.stages.find((candidate) => candidate.id === toStageId);
		if (!stage || selected.size === 0) return;

		if (stage.kind === 'rejected') {
			reason = '';
			bulkPending = { toStageId, name: stage.name };
			return;
		}

		void runBulk(toStageId);
	}

	/**
	 * Shuffle one column left or right.
	 *
	 * Buttons rather than dragging the columns themselves. Dragging a column while
	 * cards are also draggable means guessing which of the two the user meant, and
	 * a keyboard cannot express either — this is the interaction that has to work.
	 */
	async function shift(stageId: string, direction: -1 | 1) {
		const order = data.stages.map((stage) => stage.id);
		const from = order.indexOf(stageId);
		const to = from + direction;
		if (from === -1 || to < 0 || to >= order.length) return;

		[order[from], order[to]] = [order[to], order[from]];

		working = true;
		try {
			await reorderStages({ orgSlug, jobId, orderedIds: order });
		} catch (failure) {
			toast.error(failure instanceof Error ? failure.message : 'Could not reorder the stages.');
		} finally {
			working = false;
		}
	}

	/** The stage queued for deletion, with the count that decides how hard we ask. */
	let deleting = $state<{ id: string; name: string; count: number } | null>(null);

	async function submitDelete() {
		if (!deleting) return;

		working = true;
		try {
			await deleteStage({ orgSlug, jobId, stageId: deleting.id });
			deleting = null;
			toast.success('Stage deleted.');
		} catch (failure) {
			toast.error(failure instanceof Error ? failure.message : 'Could not delete that stage.');
		} finally {
			working = false;
		}
	}
</script>

<svelte:head><title>{job.title} · Board</title></svelte:head>

<svelte:boundary>
	{#snippet pending()}
		<PageSkeleton>
			<BoardSkeleton />
		</PageSkeleton>
	{/snippet}

	<div class="flex flex-col gap-6 p-(--fann-space-page)">
		<div class="flex flex-wrap items-end justify-between gap-4">
			<div class="flex flex-col gap-1">
				<a
					href="/hire/{orgSlug}/jobs/{jobId}"
					class="flex items-center gap-1.5 text-xs text-text-muted hover:text-text"
				>
					<Icon icon={icons.chevronLeft} class="size-3" />
					{job.title}
				</a>
				<h1 class="text-2xl text-text">Board</h1>
				<p class="text-sm text-text-muted">
					{data.cards.length}
					{data.cards.length === 1 ? 'person has' : 'people have'} applied. Moving someone tells them
					where they stand.
				</p>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				{#if canMove}
					<Button
						size="sm"
						variant={selecting ? 'primary' : 'secondary'}
						onclick={() => (selecting ? clearSelection() : (selecting = true))}
					>
						<Icon icon={icons.check} class="size-3.5" />
						{selecting ? 'Done' : 'Select'}
					</Button>
				{/if}
				<Button href="/hire/{orgSlug}/jobs/{jobId}/applicants" size="sm">
					<Icon icon={icons.inbox} class="size-3.5" />
					List view
				</Button>
				{#if canManage}
					<Button size="sm" onclick={() => (addingStage = true)}>
						<Icon icon={icons.add} class="size-3.5" />
						Add stage
					</Button>
				{/if}
			</div>
		</div>

		{#if selecting && selected.size > 0}
			<div
				class="flex flex-wrap items-center gap-3 border border-border-accent bg-surface-selected p-(--fann-space-control)"
			>
				<span class="text-sm text-text">
					<span data-numeric>{selected.size}</span>
					selected
				</span>
				<Select
					value={bulkStageId}
					items={data.stages.map((stage) => ({ value: stage.id, label: stage.name }))}
					size="sm"
					placeholder="Move all to…"
					class="w-52"
					disabled={working}
					onValueChange={requestBulkMove}
				/>
				<div class="flex-1"></div>
				<Button size="sm" variant="ghost" onclick={clearSelection}>Clear</Button>
			</div>
		{/if}

		<!--
			Horizontal scroll on the board only, never on the page. `overflow-x-auto`
			here rather than on a parent keeps the header and the rest of the app fixed
			while six columns scroll under it.
		-->
		<div class="flex gap-4 overflow-x-auto pb-4">
			{#each columns as column, index (column.stage.id)}
				<StageColumn
					name={column.stage.name}
					kind={column.stage.kind}
					count={column.cards.length}
					active={hoveredStageId === column.stage.id}
					ondragover={(event) => {
						if (!canMove) return;
						// Without `preventDefault` the browser refuses the drop entirely.
						event.preventDefault();
						hoveredStageId = column.stage.id;
					}}
					ondragleave={() => {
						if (hoveredStageId === column.stage.id) hoveredStageId = null;
					}}
					ondrop={(event) => {
						event.preventDefault();
						hoveredStageId = null;
						const id = event.dataTransfer?.getData('text/plain');
						if (id) requestMove(id, column.stage.id);
					}}
				>
					{#snippet actions()}
						{#if canManage}
							<button
								type="button"
								class="text-text-subtle hover:text-text disabled:opacity-30"
								aria-label="Move {column.stage.name} left"
								disabled={working || index === 0}
								onclick={() => shift(column.stage.id, -1)}
							>
								<Icon icon={icons.chevronLeft} class="size-3.5" />
							</button>
							<button
								type="button"
								class="text-text-subtle hover:text-text disabled:opacity-30"
								aria-label="Move {column.stage.name} right"
								disabled={working || index === columns.length - 1}
								onclick={() => shift(column.stage.id, 1)}
							>
								<Icon icon={icons.chevronRight} class="size-3.5" />
							</button>
							<button
								type="button"
								class="text-text-subtle hover:text-text"
								aria-label="Rename {column.stage.name}"
								onclick={() => {
									renaming = { id: column.stage.id, original: column.stage.name };
									renamed = column.stage.name;
								}}
							>
								<Icon icon={icons.edit} class="size-3.5" />
							</button>
							<button
								type="button"
								class="text-text-subtle hover:text-danger"
								aria-label="Delete {column.stage.name}"
								onclick={() =>
									(deleting = {
										id: column.stage.id,
										name: column.stage.name,
										count: column.cards.length
									})}
							>
								<Icon icon={icons.close} class="size-3.5" />
							</button>
						{/if}
					{/snippet}

					{#each column.cards as card (card.id)}
						<CandidateCard
							id={card.id}
							href="/hire/{orgSlug}/applications/{card.id}"
							candidateName={card.candidateName}
							candidateEmail={card.candidateEmail}
							stageEnteredAt={card.stageEnteredAt}
							firstRespondedAt={card.firstRespondedAt}
							resumeDocumentId={card.resumeDocumentId}
							stages={data.stages}
							currentStageId={column.stage.id}
							{canMove}
							selected={selecting ? selected.has(card.id) : null}
							onselect={(on) => toggleSelected(card.id, on)}
							dragging={draggingId === card.id}
							onmove={(toStageId) => requestMove(card.id, toStageId)}
							ondragstart={(event) => {
								draggingId = card.id;
								event.dataTransfer?.setData('text/plain', card.id);
							}}
							ondragend={() => {
								draggingId = null;
								hoveredStageId = null;
							}}
						/>
					{/each}
				</StageColumn>
			{/each}
		</div>
	</div>
</svelte:boundary>

<!-- Rejection reason ------------------------------------------------------- -->
<Dialog
	open={pending !== null || bulkPending !== null}
	title="Tell them why"
	description="This goes to the candidate. It is the one thing this product will not let a company skip."
>
	<div class="flex flex-col gap-4">
		<p class="text-sm text-text-muted">
			{#if bulkPending}
				All <span data-numeric>{selected.size}</span> of them will read this. If they need different reasons,
				turn them down one at a time.
			{:else}
				{pending?.name} will read this. A sentence is enough; silence is not an option here.
			{/if}
		</p>
		<Field label="Reason">
			{#snippet children(control)}
				<Textarea
					{...control}
					bind:value={reason}
					rows={4}
					placeholder="We went with someone who has more experience with…"
				/>
			{/snippet}
		</Field>
	</div>

	{#snippet footer()}
		<FormActions>
			{#snippet aside()}
				<Button
					variant="ghost"
					onclick={() => {
						pending = null;
						bulkPending = null;
					}}
				>
					Cancel
				</Button>
			{/snippet}
			<Button
				variant="primary"
				loading={working}
				disabled={reason.trim().length === 0}
				onclick={() => {
					if (bulkPending) void runBulk(bulkPending.toStageId, reason);
					else if (pending) void commitMove(pending.applicationId, pending.toStageId, reason);
				}}
			>
				Turn down and send
			</Button>
		</FormActions>
	{/snippet}
</Dialog>

<!-- Add a stage ------------------------------------------------------------ -->
<Dialog
	bind:open={addingStage}
	title="Add a stage"
	description="A new column on this job's board. It does not change any other job."
>
	<div class="flex flex-col gap-4">
		<Field label="Name">
			{#snippet children(control)}
				<Input {...control} bind:value={newStageName} placeholder="Take-home task" />
			{/snippet}
		</Field>

		<Field
			label="What it means"
			hint="The name is yours; this is what the candidate is told when someone lands here."
		>
			{#snippet children(control)}
				<Select {...control} bind:value={newStageKind} items={KIND_OPTIONS} />
			{/snippet}
		</Field>
	</div>

	{#snippet footer()}
		<FormActions>
			{#snippet aside()}
				<Button variant="secondary" onclick={() => (addingStage = false)}>Cancel</Button>
			{/snippet}
			<Button
				variant="primary"
				loading={working}
				disabled={newStageName.trim().length === 0}
				onclick={submitStage}
			>
				Add stage
			</Button>
		</FormActions>
	{/snippet}
</Dialog>

<!-- Rename a stage -------------------------------------------------------- -->
<Dialog
	open={renaming !== null}
	title="Rename this stage"
	description="Only the label changes. What the stage means to a candidate is set by its kind, not its name."
>
	<Field label="Name">
		{#snippet children(control)}
			<Input {...control} bind:value={renamed} />
		{/snippet}
	</Field>

	{#snippet footer()}
		<FormActions>
			{#snippet aside()}
				<Button variant="secondary" onclick={() => (renaming = null)}>Cancel</Button>
			{/snippet}
			<Button
				variant="primary"
				loading={working}
				disabled={renamed.trim().length === 0}
				onclick={submitRename}
			>
				Rename
			</Button>
		</FormActions>
	{/snippet}
</Dialog>

<!--
	Delete a stage.

	The typed phrase appears only when somebody is standing in the column. Asking
	for it every time trains people to type without reading; asking when there are
	people to displace is the case where a reflexive Enter actually costs something.
-->
<ConfirmDialog
	open={deleting !== null}
	title="Delete this stage?"
	description="The column disappears from this job's board. Other jobs are untouched."
	detail={deleting && deleting.count > 0
		? `${deleting.count} ${deleting.count === 1 ? 'person is' : 'people are'} in "${deleting.name}". They move to the stage before it — nobody is lost, but the board will look different to your team.`
		: undefined}
	confirmPhrase={deleting && deleting.count > 0 ? deleting.name : undefined}
	confirmLabel="Delete stage"
	loading={working}
	onconfirm={submitDelete}
	oncancel={() => (deleting = null)}
/>
