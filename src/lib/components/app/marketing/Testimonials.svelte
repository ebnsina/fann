<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { Testimonial } from '#lib/content/marketing';
	import { icons } from '#lib/design/icons';

	type Props = { testimonials: Testimonial[] };
	let { testimonials }: Props = $props();
</script>

<div class="grid gap-px border border-border bg-border lg:grid-cols-3">
	{#each testimonials as testimonial (testimonial.quote)}
		<figure class="flex flex-col justify-between gap-6 bg-surface p-(--fann-space-panel)">
			<div class="flex flex-col gap-4">
				<Icon icon={icons.quote} class="size-5 text-text-subtle" />
				<blockquote class="text-sm text-text">{testimonial.quote}</blockquote>
			</div>
			<figcaption class="flex flex-col gap-0.5 border-t border-dashed border-border pt-4">
				<span class="text-sm font-medium text-text">{testimonial.role}</span>
				<span class="text-xs text-text-subtle">{testimonial.company}</span>
			</figcaption>
		</figure>
	{/each}
</div>
