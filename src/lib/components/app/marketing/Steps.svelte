<script lang="ts">
	import type { Step } from '#lib/content/marketing';

	type Props = { steps: Step[] };
	let { steps }: Props = $props();

	// The column count follows the number of steps, so the last row is always full.
	// This grid draws its dividers as a `bg-border` gap showing through, which means
	// a leftover cell is not empty space — it is a grey box.
	const columns = $derived(
		// Three stays single-column until `lg`, because three in two columns has the
		// same leftover-cell problem one breakpoint lower down.
		steps.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'lg:grid-cols-3'
	);
</script>

<ol class="grid gap-px border border-border bg-border {columns}">
	{#each steps as step, index (step.title)}
		<li class="relative flex flex-col gap-3 overflow-hidden bg-surface p-(--fann-space-panel)">
			<!--
				The step number, set large and hung off the top-right corner so the card
				clips it. Half a numeral reads as a marker; a whole one competes with
				the heading for the first thing you look at.

				`aria-hidden` because the list is an `<ol>` — the numbering is already
				in the markup, and a screen reader announcing "3" twice is worse than
				not drawing it at all. Mono and tabular so a two-digit step lands on the
				same left edge as a one-digit one.
			-->
			<span
				aria-hidden="true"
				class="pointer-events-none absolute -top-4 -right-3 font-mono text-6xl leading-none font-semibold text-accent-subtle tabular-nums select-none"
			>
				{index + 1}
			</span>

			<h3 class="relative text-base font-semibold text-text">{step.title}</h3>
			<p class="relative text-sm text-text-muted">{step.body}</p>
		</li>
	{/each}
</ol>
