<script lang="ts">
	import type { Snippet } from 'svelte';
	import Kbd from './Kbd.svelte';

	/**
	 * A tooltip.
	 *
	 * Opens on hover *and* on keyboard focus, because a hint only a mouse can reach
	 * is not a hint. It carries no information available nowhere else — the label is
	 * attached with `aria-describedby`, which is the weaker relationship on purpose:
	 * a screen reader should read the control first and this second.
	 *
	 * Positioned with plain absolute offsets rather than a collision-aware library.
	 * These sit on toolbar buttons well inside the viewport; if one ever needs to
	 * flip at an edge, that is the point to reach for anchor positioning rather than
	 * to grow this.
	 */
	type Props = {
		content: string;
		/** Shortcut hint rendered alongside the label, e.g. `⌘K`. */
		shortcut?: string;
		side?: 'top' | 'right' | 'bottom' | 'left';
		/** Tooltips must never carry information available nowhere else. */
		children: Snippet<[{ props: Record<string, unknown> }]>;
	};

	let { content, shortcut, side = 'top', children }: Props = $props();

	const generatedId = $props.id();

	let open = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	/** A short delay, so sweeping the pointer across a toolbar does not flash six. */
	function show() {
		clearTimeout(timer);
		timer = setTimeout(() => (open = true), 200);
	}

	function hide() {
		clearTimeout(timer);
		open = false;
	}

	const SIDES = {
		top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
		bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
		left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
		right: 'left-full top-1/2 -translate-y-1/2 ml-1.5'
	} as const;
</script>

<span class="relative inline-flex">
	{@render children({
		props: {
			'aria-describedby': open ? generatedId : undefined,
			onpointerenter: show,
			onpointerleave: hide,
			onfocusin: () => (open = true),
			onfocusout: hide,
			// Escape closes it, the same as any other transient layer.
			onkeydown: (event: KeyboardEvent) => {
				if (event.key === 'Escape') hide();
			}
		}
	})}

	{#if open}
		<span
			id={generatedId}
			role="tooltip"
			class="pointer-events-none absolute z-50 flex w-max items-center gap-2 bg-surface-inverted px-2 py-1 text-xs text-text-inverted shadow-popover {SIDES[
				side
			]}"
		>
			<span>{content}</span>
			{#if shortcut}
				<Kbd class="border-transparent bg-on-inverted-subtle text-current">{shortcut}</Kbd>
			{/if}
		</span>
	{/if}
</span>
