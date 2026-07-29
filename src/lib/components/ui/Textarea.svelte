<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { cn } from '#lib/utils/cn';
	import { INPUT_BASE } from './Input.svelte';

	type Props = {
		class?: string;
		/** Remote form fields supply , so accept both. */
		value?: string | number;
		/** Grows with the content instead of scrolling. */
		autoresize?: boolean;
	} & Omit<HTMLTextareaAttributes, 'class' | 'value'>;

	let {
		class: className,
		value = $bindable(''),
		autoresize = false,
		rows = 4,
		...rest
	}: Props = $props();

	let element = $state<HTMLTextAreaElement>();

	$effect(() => {
		// Read `value` first so the effect re-runs on every edit — `scrollHeight`
		// alone is not reactive, so nothing else here would register the dependency.
		void value;
		if (!autoresize || !element) return;

		// Reset before measuring, otherwise the box can only ever grow.
		element.style.height = 'auto';
		element.style.height = `${element.scrollHeight}px`;
	});
</script>

<textarea
	bind:this={element}
	bind:value
	{rows}
	class={cn(
		INPUT_BASE,
		'py-2.5 leading-normal',
		autoresize && 'resize-none overflow-hidden',
		className
	)}
	{...rest}></textarea>
