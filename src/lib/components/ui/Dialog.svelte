<script lang="ts">
	import { icons } from '#lib/design/icons';
	import Icon from './Icon.svelte';
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils/cn';

	/**
	 * A modal dialog, built on the native `<dialog>` element.
	 *
	 * `showModal()` is why this is not hand-written ARIA: the browser gives the
	 * focus trap, the escape key, the inert background, the top layer and
	 * `aria-modal` semantics. Reimplementing those is the part of a dialog that is
	 * genuinely hard to get right, and the platform already did it.
	 *
	 * What is left is ours: reflecting `open` in both directions, styling the
	 * backdrop through `::backdrop`, and closing on a click outside — none of which
	 * the element does by itself.
	 */
	type Props = {
		open?: boolean;
		title: string;
		/** Always give a dialog a description — it is what a screen reader reads first. */
		description?: string;
		size?: 'sm' | 'md' | 'lg';
		class?: string;
		trigger?: Snippet<[{ props: Record<string, unknown> }]>;
		children: Snippet;
		footer?: Snippet;
	};

	let {
		open = $bindable(false),
		title,
		description,
		size = 'md',
		class: className,
		trigger,
		children,
		footer
	}: Props = $props();

	const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

	const generatedId = $props.id();

	let element = $state<HTMLDialogElement | null>(null);

	/*
	 * `showModal()` throws if the dialog is already open, and `close()` on a closed
	 * one fires nothing — so both are guarded on the element's own `open`, which is
	 * the browser's opinion rather than ours.
	 */
	$effect(() => {
		if (!element) return;
		if (open && !element.open) element.showModal();
		else if (!open && element.open) element.close();
	});

	/** Escape and the close button both fire `close`; this is where `open` follows. */
	function onclose() {
		open = false;
	}

	/**
	 * Close on a click outside the panel.
	 *
	 * The click lands on the `<dialog>` itself, because the element fills the
	 * viewport while the visible card is a child. Comparing against the panel's box
	 * rather than the event target is what makes a click on the backdrop distinct
	 * from a click on the card — `event.target === element` alone is fooled by a
	 * drag that starts inside and ends outside.
	 */
	function onpointerdown(event: PointerEvent) {
		if (!element || event.target !== element) return;

		const box = element.getBoundingClientRect();
		const inside =
			event.clientX >= box.left &&
			event.clientX <= box.right &&
			event.clientY >= box.top &&
			event.clientY <= box.bottom;

		if (!inside) element.close();
	}
</script>

{#if trigger}
	{@render trigger({ props: { onclick: () => (open = true) } })}
{/if}

<!--
	`m-auto` and explicit sizing, because a `<dialog>` in the top layer is
	positioned by the browser rather than by a parent — the usual
	fixed/translate centring does not apply to it.
-->
<dialog
	bind:this={element}
	{onclose}
	{onpointerdown}
	aria-labelledby="{generatedId}-title"
	aria-describedby={description ? `${generatedId}-description` : undefined}
	class={cn(
		'm-auto w-[calc(100vw-2rem)] overflow-hidden border border-border bg-surface-overlay p-0 text-text shadow-overlay backdrop:bg-scrim',
		SIZES[size],
		className
	)}
>
	{#if open}
		<!--
			Contents are mounted only while open, so a form inside starts fresh each
			time rather than showing whatever was typed and abandoned last time.
		-->
		<div
			class="flex items-start justify-between gap-4 border-b border-border px-(--fann-space-panel) py-(--fann-space-band)"
		>
			<div class="flex flex-col gap-1">
				<h2 id="{generatedId}-title" class="text-lg font-semibold text-text">{title}</h2>
				{#if description}
					<p id="{generatedId}-description" class="text-sm text-text-muted">{description}</p>
				{/if}
			</div>

			<button
				type="button"
				onclick={() => element?.close()}
				aria-label="Close dialog"
				class="-mt-1 -mr-2 inline-flex size-8 shrink-0 items-center justify-center text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
			>
				<Icon icon={icons.close} class="size-4" />
			</button>
		</div>

		<div class="p-(--fann-space-panel)">
			{@render children()}
		</div>

		{#if footer}
			<div
				class="flex items-center justify-end gap-3 border-t border-border bg-surface-sunken px-(--fann-space-panel) py-(--fann-space-band)"
			>
				{@render footer()}
			</div>
		{/if}
	{/if}
</dialog>
