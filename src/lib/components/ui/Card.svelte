<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils/cn';

	type Props = {
		/** Drop the default padding when the content manages its own (a table, a list). */
		padded?: boolean;
		/** Optional heading bar, separated by a hairline. */
		title?: string;
		description?: string;
		class?: string;
		/** Right side of the heading bar — filters, a menu, a primary action. */
		actions?: Snippet;
		children: Snippet;
		footer?: Snippet;
	};

	let {
		padded = true,
		title,
		description,
		class: className,
		actions,
		children,
		footer
	}: Props = $props();
</script>

<!--
	`overflow-hidden` keeps the header and footer bands inside the card's box. It is
	a no-op while `--fann-radius` is 0, and the thing that stops those bands from
	squaring off the corners the moment it is not.
-->
<section class={cn('overflow-hidden border border-border bg-surface', className)}>
	{#if title}
		<div
			class="flex items-start justify-between gap-4 border-b border-border px-(--fann-space-panel) py-(--fann-space-band)"
		>
			<div class="flex flex-col gap-1">
				<h2 class="text-base font-semibold text-text">{title}</h2>
				{#if description}
					<p class="text-sm text-text-muted">{description}</p>
				{/if}
			</div>
			{#if actions}
				<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>
			{/if}
		</div>
	{/if}

	<div class={cn(padded && 'p-(--fann-space-panel)')}>
		{@render children()}
	</div>

	{#if footer}
		<div
			class="flex items-center justify-end gap-3 border-t border-border bg-surface-sunken px-(--fann-space-panel) py-(--fann-space-band)"
		>
			{@render footer()}
		</div>
	{/if}
</section>
