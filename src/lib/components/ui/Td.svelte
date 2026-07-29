<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils/cn';

	type Props = {
		align?: 'left' | 'right';
		/** Geist Mono + tabular figures. Use for salaries, counts, ids and dates. */
		mono?: boolean;
		/** Truncates instead of wrapping. Pair with a title attribute or tooltip. */
		truncate?: boolean;
		class?: string;
		children: Snippet;
	};

	let {
		align = 'left',
		mono = false,
		truncate = false,
		class: className,
		children
	}: Props = $props();
</script>

<td
	class={cn(
		'h-(--fann-row-height) px-4 text-text',
		align === 'right' && 'text-right',
		mono && 'font-mono text-xs tabular-nums',
		truncate && 'max-w-0 truncate',
		className
	)}
>
	{@render children()}
</td>
