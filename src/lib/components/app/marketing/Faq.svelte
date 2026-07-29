<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { Faq } from '#lib/content/marketing';
	import { icons } from '#lib/design/icons';

	type Props = { items: Faq[] };
	let { items }: Props = $props();
</script>

<!--
	Native `<details>` rather than a JS accordion: it is keyboard accessible,
	findable by in-page search, and works before hydration.
-->
<div class="flex flex-col border border-border bg-surface">
	{#each items as item (item.question)}
		<details class="group border-b border-border last:border-b-0">
			<summary
				class="flex cursor-pointer items-center justify-between gap-4 p-(--fann-space-panel) text-sm font-medium text-text marker:content-none hover:bg-surface-hover"
			>
				{item.question}
				<Icon
					icon={icons.chevronDown}
					class="size-4 shrink-0 text-text-subtle transition-transform duration-(--fann-duration-fast) group-open:rotate-180"
				/>
			</summary>
			<p class="px-(--fann-space-panel) pb-(--fann-space-panel) text-sm text-text-muted">
				{item.answer}
			</p>
		</details>
	{/each}
</div>
