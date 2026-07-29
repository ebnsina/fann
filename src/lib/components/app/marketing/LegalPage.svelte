<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { LegalSection } from '#lib/content/legal';
	import { icons } from '#lib/design/icons';

	type Props = {
		title: string;
		lead: string;
		updated: string;
		sections: LegalSection[];
	};

	let { title, lead, updated, sections }: Props = $props();
</script>

<!--
	Shared shell for the privacy policy and the terms.

	Numbered headings and a fixed measure, because these are documents people scan
	for one clause and then quote at you. The prose plugin is not used: it styles
	for article typography, and a policy wants the product's own type scale so the
	body here matches the body everywhere else.
-->
<article class="mx-auto flex max-w-3xl flex-col gap-10 px-(--fann-space-page) py-16">
	<header class="flex flex-col gap-4">
		<h1 class="text-3xl text-text">{title}</h1>
		<p class="text-base text-text-muted">{lead}</p>
		<p class="font-mono text-xs text-text-subtle" data-numeric>Last updated {updated}</p>
	</header>

	<!--
		Said where a reader can see it, not buried in a code comment. A policy that
		has not been checked is still worth publishing — it tells people what the
		software actually does — but claiming more than that would be the exact kind
		of thing this page is supposed to prevent.
	-->
	<div
		class="flex items-start gap-3 border border-dashed border-border bg-surface p-(--fann-space-panel) text-sm text-text-muted"
	>
		<Icon icon={icons.info} class="mt-0.5 size-4 shrink-0 text-text-subtle" />
		<p>
			Written in plain language to describe what the product does, and not yet reviewed by a lawyer.
			If anything here is unclear, ask us rather than guessing.
		</p>
	</div>

	<div class="flex flex-col gap-10">
		{#each sections as section, index (section.heading)}
			<section class="flex flex-col gap-3">
				<h2 class="flex items-baseline gap-3 text-lg font-semibold text-text">
					<span class="font-mono text-sm text-text-subtle tabular-nums" data-numeric>
						{String(index + 1).padStart(2, '0')}
					</span>
					{section.heading}
				</h2>
				{#each section.body as paragraph (paragraph)}
					<p class="text-sm text-text-muted">{paragraph}</p>
				{/each}
			</section>
		{/each}
	</div>
</article>
