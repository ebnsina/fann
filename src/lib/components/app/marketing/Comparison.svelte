<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { ComparisonRow } from '#lib/content/marketing';
	import { icons } from '#lib/design/icons';

	type Props = { rows: ComparisonRow[] };
	let { rows }: Props = $props();
</script>

<!--
	A real `<table>`, not a grid of divs: this is tabular data, and a screen reader
	should be able to say "Reply times, Fann, measured by us" rather than reading
	three unrelated cells in a row.

	The comparison column says "most job boards" and names nobody — a fair
	description of the norm is defensible; a named competitor's feature list goes
	stale the week they change it.
-->
<div class="overflow-x-auto border border-border bg-surface">
	<table class="w-full min-w-xl border-collapse text-left">
		<thead>
			<tr class="border-b border-border">
				<th scope="col" class="p-(--fann-space-panel) text-xs font-medium text-text-subtle">
					<span class="sr-only">What we are comparing</span>
				</th>
				<th scope="col" class="p-(--fann-space-panel) text-sm font-semibold text-text-accent">
					Fann
				</th>
				<th scope="col" class="p-(--fann-space-panel) text-sm font-semibold text-text-muted">
					Most job boards
				</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.label)}
				<tr class="border-b border-border last:border-b-0">
					<th scope="row" class="p-(--fann-space-panel) text-sm font-medium text-text">
						{row.label}
					</th>
					<td class="p-(--fann-space-panel) text-sm text-text">
						<span class="flex items-start gap-2">
							<Icon icon={icons.check} class="mt-0.5 size-3.5 shrink-0 text-success" />
							{row.fann}
						</span>
					</td>
					<td class="p-(--fann-space-panel) text-sm text-text-muted">
						<span class="flex items-start gap-2">
							<Icon icon={icons.unavailable} class="mt-0.5 size-3.5 shrink-0 text-text-subtle" />
							{row.elsewhere}
						</span>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
