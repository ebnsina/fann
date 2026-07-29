<script lang="ts">
	import Badge from '#lib/components/ui/Badge.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime } from '#lib/utils/format';

	type Stage = { id: string; name: string };

	type Props = {
		id: string;
		/** Where the name links to — the full application. */
		href: string;
		candidateName: string;
		candidateEmail: string;
		stageEnteredAt: Date;
		firstRespondedAt: Date | null;
		resumeDocumentId: string | null;
		/** Every column on this board, for the move control. */
		stages: Stage[];
		currentStageId: string | null;
		canMove: boolean;
		/** Null when selection is off, so the checkbox is absent rather than disabled. */
		selected?: boolean | null;
		onselect?: (selected: boolean) => void;
		onmove: (toStageId: string) => void;
		ondragstart: (event: DragEvent) => void;
		ondragend: () => void;
		dragging?: boolean;
	};

	let {
		id,
		href,
		candidateName,
		candidateEmail,
		stageEnteredAt,
		firstRespondedAt,
		resumeDocumentId,
		stages,
		currentStageId,
		canMove,
		selected = null,
		onselect,
		onmove,
		ondragstart,
		ondragend,
		dragging = false
	}: Props = $props();

	/*
	 * How long this person has been sitting in this column.
	 *
	 * Shown on the card rather than buried in a report, because the number that
	 * changes behaviour is the one somebody sees while deciding what to do next.
	 */
	const waitingDays = $derived(
		Math.floor((Date.now() - stageEnteredAt.getTime()) / (1000 * 60 * 60 * 24))
	);

	/** Nobody from the company has replied yet, and it has been a while. */
	const stale = $derived(!firstRespondedAt && waitingDays >= 7);

	const moveOptions = $derived(
		stages
			.filter((stage) => stage.id !== currentStageId)
			.map((stage) => ({ value: stage.id, label: stage.name }))
	);
</script>

<!--
	`draggable` is the enhancement, not the interface. Dragging is unusable with a
	keyboard and hostile on a touch screen, so the select below does the same job
	and is the one that has to work — see the board page.
-->
<article
	draggable={canMove}
	{ondragstart}
	{ondragend}
	class="flex flex-col gap-3 bg-surface p-3 transition-opacity {dragging ? 'opacity-40' : ''}"
	aria-label="{candidateName}, waiting {waitingDays} days"
>
	<div class="flex items-start gap-2">
		{#if selected !== null}
			<!-- Native checkbox rather than the styled primitive: it sits inside a
			     draggable card, and the primitive's label wrapper swallows the drag. -->
			<input
				type="checkbox"
				checked={selected}
				aria-label="Select {candidateName}"
				class="mt-1 size-3.5 shrink-0 accent-accent"
				onchange={(event) => onselect?.(event.currentTarget.checked)}
			/>
		{/if}
		<div class="flex min-w-0 flex-col gap-0.5">
			<a
				{href}
				class="truncate text-sm font-medium text-text underline-offset-2 hover:text-text-accent hover:underline"
			>
				{candidateName}
			</a>
			<span class="truncate text-xs text-text-subtle">{candidateEmail}</span>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		{#if stale}
			<!-- The whole promise of this product, on the card that is breaking it. -->
			<Badge tone="warning" icon={icons.time}>No reply in {waitingDays}d</Badge>
		{:else}
			<span class="flex items-center gap-1.5 text-xs text-text-subtle">
				<Icon icon={icons.time} class="size-3" />
				<time datetime={stageEnteredAt.toISOString()}>{formatRelativeTime(stageEnteredAt)}</time>
			</span>
		{/if}

		{#if resumeDocumentId}
			<a
				href="/files/{resumeDocumentId}"
				target="_blank"
				rel="noopener"
				class="flex items-center gap-1.5 text-xs text-text-accent underline-offset-2 hover:underline"
			>
				<Icon icon={icons.document} class="size-3" />
				CV
			</a>
		{/if}
	</div>

	{#if canMove && moveOptions.length > 0}
		<Select
			items={moveOptions}
			size="sm"
			placeholder="Move to…"
			onValueChange={onmove}
			aria-describedby="card-{id}"
		/>
	{/if}
</article>
