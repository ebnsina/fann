<!--
	Wraps a block so it fades into place as you scroll to it.

	All the behaviour lives in `#lib/design/motion.css`; this exists so a page says
	`<Reveal>` instead of repeating a class name, and so the effect can be changed
	or removed in one place. It renders a plain `<div>` and adds no JavaScript.

	`Section` already reveals its whole contents, so this is only for a block that
	sits outside one. Nesting it inside a `Section` makes half the section arrive
	after the other half, which is the exact thing the single-unit rule prevents.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils/cn';

	type Props = {
		class?: string;
		children: Snippet;
	};

	let { class: className, children }: Props = $props();
</script>

<div class={cn('fann-reveal', className)}>
	{@render children()}
</div>
