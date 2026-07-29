<script lang="ts">
	import type { Snippet } from 'svelte';
	import Badge, { type BadgeTone } from '#lib/components/ui/Badge.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';
	import { cn } from '#lib/utils/cn';

	export type StageKind = 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected';

	type Props = {
		name: string;
		kind: StageKind;
		count: number;
		/** True while a card is being dragged over this column. */
		active?: boolean;
		/** Column-level actions — rename, delete — for whoever may edit the process. */
		actions?: Snippet;
		children: Snippet;
		ondragover?: (event: DragEvent) => void;
		ondragleave?: (event: DragEvent) => void;
		ondrop?: (event: DragEvent) => void;
	};

	let {
		name,
		kind,
		count,
		active = false,
		actions,
		children,
		ondragover,
		ondragleave,
		ondrop
	}: Props = $props();

	/*
	 * The kind is shown, not just used.
	 *
	 * A column named "Coffee chat" that quietly rejects people is the sort of thing
	 * that gets discovered by a candidate rather than by the person who set it up.
	 * The badge says what the column *does*, next to whatever it is called.
	 */
	const KIND_TONE: Record<StageKind, BadgeTone> = {
		applied: 'neutral',
		screening: 'info',
		interview: 'accent',
		offer: 'success',
		hired: 'success',
		rejected: 'danger'
	};

	const KIND_LABEL: Record<StageKind, string> = {
		applied: 'New',
		screening: 'Reviewing',
		interview: 'Interviewing',
		offer: 'Offer',
		hired: 'Hired',
		rejected: 'Turned down'
	};
</script>

<!--
	`ondragover` must call `preventDefault()` for a drop to be allowed at all — the
	page owns that, because it also decides whether *this* card may land here.
-->
<!--
	`role="group"` rather than letting a labelled `<section>` become a landmark:
	six landmarks on one board is noise in a screen reader's list. The group name
	carries the column and its count, so moving through the board announces where
	you are.
-->
<section
	role="group"
	aria-label="{name} — {count} {count === 1 ? 'candidate' : 'candidates'}"
	class={cn(
		'flex w-72 shrink-0 flex-col border border-border bg-surface transition-colors duration-(--fann-duration-fast)',
		active && 'border-border-accent bg-surface-selected'
	)}
	{ondragover}
	{ondragleave}
	{ondrop}
>
	<header class="flex flex-col gap-2 border-b border-dashed border-border p-4">
		<div class="flex items-center justify-between gap-2">
			<h3 class="truncate text-sm font-medium text-text">{name}</h3>
			<div class="flex shrink-0 items-center gap-1">
				<span class="text-xs text-text-subtle" data-numeric>{count}</span>
				{#if actions}{@render actions()}{/if}
			</div>
		</div>
		<Badge tone={KIND_TONE[kind]}>{KIND_LABEL[kind]}</Badge>
	</header>

	<!--
		`bg-border` only when there is something to divide. The hairlines between
		cards are this background showing through a 1px gap, so on an empty column it
		is not a divider — it is a solid grey slab where the cards should be.
	-->
	<div class={cn('flex min-h-32 flex-1 flex-col gap-px', count > 0 && 'bg-border')}>
		{#if count === 0}
			<p class="flex items-center gap-2 p-4 text-xs text-text-subtle">
				<Icon icon={icons.inbox} class="size-3.5" />
				Nobody here yet
			</p>
		{:else}
			{@render children()}
		{/if}
	</div>
</section>
