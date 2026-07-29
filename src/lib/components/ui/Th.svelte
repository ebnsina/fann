<script lang="ts">
	import { icons } from '#lib/design/icons';
	import Icon from './Icon.svelte';
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils/cn';

	type Props = {
		/** Provide with `onsort` to make the column sortable. */
		sort?: 'asc' | 'desc' | null;
		onsort?: () => void;
		align?: 'left' | 'right';
		class?: string;
		children: Snippet;
	};

	let { sort, onsort, align = 'left', class: className, children }: Props = $props();

	const sortable = $derived(Boolean(onsort));
	// `aria-sort` belongs on the cell, so assistive tech announces the sort state
	// as part of the column rather than as a stray button label.
	const ariaSort = $derived(
		!sortable ? undefined : sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : 'none'
	);
</script>

<th
	scope="col"
	aria-sort={ariaSort}
	class={cn(
		'h-(--fann-control-md) px-4 font-medium whitespace-nowrap',
		align === 'right' && 'text-right',
		className
	)}
>
	{#if sortable}
		<button
			type="button"
			onclick={onsort}
			class={cn(
				'-mx-1 inline-flex h-6 items-center gap-1 px-1 transition-colors hover:text-text',
				align === 'right' && 'flex-row-reverse',
				sort && 'text-text'
			)}
		>
			{@render children()}
			{#if sort === 'asc'}
				<Icon icon={icons.sortAscending} class="size-3" />
			{:else if sort === 'desc'}
				<Icon icon={icons.sortDescending} class="size-3" />
			{:else}
				<Icon icon={icons.sortable} class="size-3 opacity-40" />
			{/if}
		</button>
	{:else}
		{@render children()}
	{/if}
</th>
