<script lang="ts">
	import { cn } from '#lib/utils/cn';

	type Props = {
		/** Used for initials and as the image alt text. */
		name: string;
		src?: string | null;
		size?: 'xs' | 'sm' | 'md' | 'lg';
		class?: string;
	};

	let { name, src, size = 'md', class: className }: Props = $props();

	const SIZES = {
		xs: 'size-5 text-2xs',
		sm: 'size-6 text-2xs',
		md: 'size-7 text-xs',
		lg: 'size-9 text-sm'
	} as const;

	// Record *which* src failed rather than a bare boolean, so a new src is retried
	// automatically. A plain flag would permanently pin the avatar to its initials
	// after one bad URL.
	let failedSrc = $state<string | null>(null);
	const failed = $derived(src != null && failedSrc === src);

	const initials = $derived(
		name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('')
	);
</script>

<span
	class={cn(
		'inline-flex shrink-0 items-center justify-center overflow-hidden border border-border bg-surface-hover font-medium text-text-muted select-none',
		SIZES[size],
		className
	)}
>
	{#if src && !failed}
		<img {src} alt={name} class="size-full object-cover" onerror={() => (failedSrc = src)} />
	{:else}
		<span aria-hidden="true">{initials}</span>
		<span class="sr-only">{name}</span>
	{/if}
</span>
