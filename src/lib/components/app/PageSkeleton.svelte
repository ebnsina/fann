<script lang="ts">
	import type { Snippet } from 'svelte';
	import Skeleton from '#lib/components/ui/Skeleton.svelte';

	type Props = {
		/** Stands in for the page's own body. Omit for a plain block. */
		children?: Snippet;
	};

	let { children }: Props = $props();
</script>

<!--
	The loading state for a whole employer page.

	One component so every page's skeleton has the same header shape and the same
	page padding — a skeleton that does not match the page it precedes produces a
	visible jump at exactly the moment the reader starts looking.

	`aria-busy` with a single spoken line, rather than letting a screen reader read
	out a dozen decorative placeholders.
-->
<div class="flex flex-col gap-6 p-(--fann-space-page)" aria-busy="true" aria-live="polite">
	<span class="sr-only">Loading…</span>

	<div class="flex flex-col gap-2">
		<Skeleton height="0.75rem" width="9rem" />
		<Skeleton height="1.75rem" width="14rem" />
		<Skeleton height="0.875rem" width="24rem" />
	</div>

	{#if children}
		{@render children()}
	{:else}
		<Skeleton height="16rem" />
	{/if}
</div>
