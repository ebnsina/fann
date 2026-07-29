<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils/cn';

	export type TabItem = { value: string; label: string; count?: number };

	/**
	 * Tabs.
	 *
	 * Roving tabindex: exactly one tab is in the tab order at a time, and the arrow
	 * keys move between them. That is the part worth writing by hand — a tablist
	 * where every tab is tabbable makes somebody press Tab five times to get past a
	 * row of headings.
	 */
	type Props = {
		value?: string;
		items: TabItem[];
		class?: string;
		/** Rendered once, receiving the active value — panels are yours to switch on. */
		children: Snippet<[string]>;
	};

	let { value = $bindable(), items, class: className, children }: Props = $props();

	// Falls back to the first tab, and keeps following `items` if they change —
	// seeding `value` once would strand the component on a tab that no longer exists.
	const active = $derived(value ?? items[0]?.value ?? '');

	const generatedId = $props.id();

	let list = $state<HTMLDivElement | null>(null);

	function select(next: string) {
		value = next;
	}

	function onkeydown(event: KeyboardEvent) {
		const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
		if (!keys.includes(event.key)) return;

		event.preventDefault();
		const at = items.findIndex((item) => item.value === active);

		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? items.length - 1
					: (at + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;

		select(items[next].value);
		// Selection follows focus, which is the expected behaviour when switching a
		// tab is cheap. Focus has to be moved by hand because only one is tabbable.
		queueMicrotask(() => {
			list?.querySelector<HTMLButtonElement>(`[data-value="${items[next].value}"]`)?.focus();
		});
	}
</script>

<div class={cn('flex flex-col', className)}>
	<!--
		The handler sits on each tab rather than the tablist. Under roving tabindex
		the container is never focused, so a listener there would only ever see
		bubbled events — and Svelte is right that a keyboard handler on a thing that
		cannot be focused is a smell.
	-->
	<div bind:this={list} role="tablist" class="flex items-center gap-4 border-b border-border">
		{#each items as item (item.value)}
			<button
				type="button"
				role="tab"
				id="{generatedId}-tab-{item.value}"
				data-value={item.value}
				aria-selected={active === item.value}
				aria-controls="{generatedId}-panel-{item.value}"
				tabindex={active === item.value ? 0 : -1}
				{onkeydown}
				onclick={() => select(item.value)}
				class={cn(
					'-mb-px flex h-8 items-center gap-1.5 border-b-2 border-b-transparent text-sm font-medium text-text-muted transition-colors duration-(--fann-duration-fast) hover:text-text',
					active === item.value && 'border-b-accent text-text'
				)}
			>
				{item.label}
				{#if item.count !== undefined}
					<span class="font-mono text-2xs text-text-subtle tabular-nums">{item.count}</span>
				{/if}
			</button>
		{/each}
	</div>

	{#each items as item (item.value)}
		{#if active === item.value}
			<div
				role="tabpanel"
				id="{generatedId}-panel-{item.value}"
				aria-labelledby="{generatedId}-tab-{item.value}"
				tabindex="0"
				class="pt-4"
			>
				{@render children(item.value)}
			</div>
		{/if}
	{/each}
</div>
