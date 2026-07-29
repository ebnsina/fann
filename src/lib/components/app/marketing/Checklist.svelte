<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';

	type Props = {
		items: string[];
		/**
		 * `included` ticks things off; `planned` marks them as not here yet. The
		 * second exists so a page can be honest about gaps without the reader having
		 * to notice a caption.
		 */
		tone?: 'included' | 'planned';
		columns?: 1 | 2;
	};

	let { items, tone = 'included', columns = 2 }: Props = $props();
</script>

<ul class="grid gap-2.5 {columns === 2 ? 'sm:grid-cols-2' : ''}">
	{#each items as item (item)}
		<li class="flex items-start gap-2.5 text-sm text-text-muted">
			<Icon
				icon={tone === 'included' ? icons.check : icons.time}
				class="mt-0.5 size-3.5 shrink-0 {tone === 'included' ? 'text-success' : 'text-text-subtle'}"
			/>
			{item}
		</li>
	{/each}
</ul>
