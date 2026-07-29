<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils/cn';

	type Props = {
		/** Secondary content — a "cancel" link, a note — pinned to the opposite edge. */
		aside?: Snippet;
		class?: string;
		children: Snippet;
	};

	let { aside, class: className, children }: Props = $props();
</script>

<!--
	The row of buttons that ends a form.

	Actions sit on the right, always. Putting them anywhere else per-form is how a
	product ends up with the submit button in three different places, and the right
	edge is where the eye already is after reading down a column of fields.

	Anything passed as `aside` — a cancel link, a warning — stays left, so the
	primary action keeps the corner to itself.
-->
<div class={cn('flex flex-wrap items-center justify-end gap-3 pt-1', className)}>
	{#if aside}
		<div class="mr-auto flex items-center gap-2 text-sm text-text-muted">{@render aside()}</div>
	{/if}
	{@render children()}
</div>
