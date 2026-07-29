<script lang="ts">
	import { cn } from '#lib/utils/cn';

	type Props = {
		size?: 'xs' | 'sm' | 'md';
		class?: string;
		/** Announced to assistive tech. Set to null inside a button that already says it. */
		label?: string | null;
	};

	let { size = 'sm', class: className, label = 'Loading' }: Props = $props();

	const SIZES = { xs: 'size-3', sm: 'size-3.5', md: 'size-4' } as const;
</script>

<svg
	class={cn('animate-spin', SIZES[size], className)}
	viewBox="0 0 16 16"
	fill="none"
	aria-hidden={label === null ? 'true' : undefined}
	role={label === null ? undefined : 'status'}
	aria-label={label ?? undefined}
>
	<circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-opacity="0.25" stroke-width="2" />
	<path
		d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
	/>
</svg>
