<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils/cn';

	type Props = { class?: string; children: Snippet };
	let { class: className, children }: Props = $props();
</script>

<kbd
	class={cn(
		'inline-flex h-6 min-w-6 items-center justify-center border border-border bg-surface-hover px-1.5 font-mono text-2xs text-text-muted',
		className
	)}
>
	{@render children()}
</kbd>
