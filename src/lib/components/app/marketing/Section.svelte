<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils/cn';

	type Props = {
		/** Small label above the heading. */
		eyebrow?: string;
		title?: string;
		lead?: string;
		/** Drop the bottom hairline on the last section before the footer. */
		bordered?: boolean;
		tinted?: boolean;
		class?: string;
		children: Snippet;
		aside?: Snippet;
	};

	let {
		eyebrow,
		title,
		lead,
		bordered = true,
		tinted = false,
		class: className,
		children,
		aside
	}: Props = $props();
</script>

<!--
	One wrapper for every marketing block, so the vertical rhythm and the max width
	are decided once. Sections that each set their own padding drift within a page
	release or two.

	It is also the single reveal unit: the whole section fades in together. Nothing
	inside should carry `fann-reveal` of its own, or one part of the block will
	settle while another is still arriving.
-->
<section class={cn(bordered && 'border-b border-border', tinted && 'bg-surface', className)}>
	<div
		class="mx-auto flex max-w-(--fann-shell-width) flex-col gap-10 px-(--fann-space-page) py-16 lg:py-20"
	>
		{#if title}
			<div class="flex flex-wrap items-end justify-between gap-4">
				<div class="flex max-w-2xl flex-col gap-3">
					{#if eyebrow}
						<p class="text-2xs font-medium tracking-wide text-text-accent uppercase">{eyebrow}</p>
					{/if}
					<h2 class="text-2xl text-text lg:text-3xl">{title}</h2>
					{#if lead}
						<p class="text-base text-text-muted">{lead}</p>
					{/if}
				</div>
				{#if aside}
					<div class="flex items-center gap-2">{@render aside()}</div>
				{/if}
			</div>
		{/if}

		{@render children()}
	</div>
</section>
