<script lang="ts" module>
	export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

	const TONES: Record<BadgeTone, string> = {
		neutral: 'border-border bg-surface-hover text-text-muted',
		accent: 'border-accent/25 bg-accent-subtle text-text-accent',
		success: 'border-success/25 bg-success-subtle text-success',
		warning: 'border-warning/25 bg-warning-subtle text-warning',
		danger: 'border-danger/25 bg-danger-subtle text-danger',
		info: 'border-info/25 bg-info-subtle text-info'
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { IconData } from '#lib/design/icons';
	import { cn } from '#lib/utils/cn';
	import Icon from './Icon.svelte';

	type Props = {
		tone?: BadgeTone;
		/** Adds a leading dot — useful for statuses in a dense list. */
		dot?: boolean;
		/**
		 * Leading glyph. Use it when the icon carries the meaning faster than the
		 * word does — a globe for remote, a clock for a deadline. Mutually exclusive
		 * with `dot`; two leading marks is one too many.
		 */
		icon?: IconData;
		class?: string;
		children: Snippet;
	};

	let { tone = 'neutral', dot = false, icon, class: className, children }: Props = $props();
</script>

<span
	class={cn(
		'inline-flex h-6 items-center gap-2 border px-2 text-2xs font-medium whitespace-nowrap',
		TONES[tone],
		className
	)}
>
	{#if icon}
		<Icon {icon} class="size-3" />
	{:else if dot}
		<span class="size-1.5 bg-current" aria-hidden="true"></span>
	{/if}
	{@render children()}
</span>
