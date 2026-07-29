<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils/cn';

	type Props = {
		title: string;
		description?: string;
		class?: string;
		/** Icon or illustration, rendered above the title. */
		icon?: Snippet;
		/** The primary action belongs here — an empty list should offer a way out. */
		action?: Snippet;
	};

	let { title, description, class: className, icon, action }: Props = $props();
</script>

<div
	class={cn(
		'flex flex-col items-center justify-center border border-dashed border-border px-8 py-16 text-center',
		className
	)}
>
	{#if icon}
		<div class="mb-4 text-text-subtle">{@render icon()}</div>
	{/if}

	<p class="text-base font-medium text-text">{title}</p>

	{#if description}
		<p class="mt-2 max-w-sm text-sm text-text-muted">{description}</p>
	{/if}

	{#if action}
		<div class="mt-6">{@render action()}</div>
	{/if}
</div>
