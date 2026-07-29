<script lang="ts" module>
	export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
	export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

	const VARIANTS: Record<ButtonVariant, string> = {
		// Indigo is reserved for the single primary action in a view.
		primary: 'bg-accent text-accent-on hover:bg-accent-hover active:bg-accent-active',
		secondary:
			'border border-border bg-surface text-text hover:bg-surface-hover active:bg-surface-active',
		ghost: 'text-text hover:bg-surface-hover active:bg-surface-active',
		danger: 'bg-danger text-danger-on hover:bg-danger-hover',
		link: 'text-text-accent underline-offset-2 hover:underline'
	};

	const SIZES: Record<ButtonSize, string> = {
		xs: 'h-(--fann-control-xs) gap-1.5 px-3 text-xs',
		sm: 'h-(--fann-control-sm) gap-2 px-4 text-sm',
		md: 'h-(--fann-control-md) gap-2 px-5 text-sm',
		lg: 'h-(--fann-control-lg) gap-2.5 px-6 text-base'
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '#lib/utils/cn';
	import Spinner from './Spinner.svelte';

	type Props = {
		variant?: ButtonVariant;
		size?: ButtonSize;
		/** Shows a spinner and blocks interaction. Width is preserved so nothing shifts. */
		loading?: boolean;
		/** Renders an `<a>` instead of a `<button>`. */
		href?: string;
		class?: string;
		children: Snippet;
	} & Omit<HTMLButtonAttributes, 'class'> &
		Omit<HTMLAnchorAttributes, 'class'>;

	let {
		variant = 'secondary',
		size = 'md',
		loading = false,
		href,
		class: className,
		children,
		disabled,
		type = 'button',
		...rest
	}: Props = $props();

	const classes = $derived(
		cn(
			'relative inline-flex items-center justify-center font-medium whitespace-nowrap',
			'transition-colors duration-(--fann-duration-fast) ease-(--ease-out)',
			'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
			VARIANTS[variant],
			// `link` has no box, so the size padding would misalign it inline.
			variant === 'link' ? 'h-auto p-0 text-sm' : SIZES[size],
			className
		)
	);
</script>

{#if href}
	<a
		{href}
		class={classes}
		aria-disabled={disabled || loading ? 'true' : undefined}
		tabindex={disabled || loading ? -1 : undefined}
		{...rest}
	>
		{@render body()}
	</a>
{:else}
	<button {type} class={classes} disabled={disabled || loading} {...rest}>
		{@render body()}
	</button>
{/if}

{#snippet body()}
	{#if loading}
		<!-- The label keeps its space so the button does not resize mid-action. -->
		<span class="invisible contents">{@render children()}</span>
		<span class="absolute inset-0 flex items-center justify-center">
			<Spinner size={size === 'lg' ? 'md' : 'sm'} />
		</span>
	{:else}
		{@render children()}
	{/if}
{/snippet}
