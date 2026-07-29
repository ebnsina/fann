<script lang="ts" module>
	export const INPUT_BASE =
		'w-full border border-border bg-surface px-(--fann-space-control) text-sm text-text ' +
		'transition-colors duration-(--fann-duration-fast) ease-(--ease-out) ' +
		'hover:border-border-strong ' +
		// The global `:focus-visible` rule in layout.css draws the ring. A field keeps
		// its neutral border underneath rather than turning accent-coloured, so the
		// ring is the only thing that changes and it reads the same on every control.
		'focus-visible:outline-none focus-visible:shadow-(--fann-ring-focus) ' +
		'disabled:bg-surface-hover disabled:text-text-muted ' +
		'aria-[invalid=true]:border-danger';
</script>

<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from '#lib/utils/cn';

	type Props = {
		size?: 'sm' | 'md' | 'lg';
		/** Renders the value in Geist Mono — use for ids, salaries, and codes. */
		mono?: boolean;
		class?: string;
		value?: HTMLInputAttributes['value'];
	} & Omit<HTMLInputAttributes, 'class' | 'size' | 'value'>;

	let {
		size = 'md',
		mono = false,
		class: className,
		value = $bindable(),
		...rest
	}: Props = $props();

	const SIZES = {
		sm: 'h-(--fann-control-sm)',
		md: 'h-(--fann-control-md)',
		lg: 'h-(--fann-control-lg)'
	} as const;
</script>

<input
	bind:value
	class={cn(INPUT_BASE, SIZES[size], mono && 'font-mono tabular-nums', className)}
	{...rest}
/>
