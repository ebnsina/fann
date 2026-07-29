<script lang="ts">
	import { cn } from '#lib/utils/cn';
	import { renderMarkdown } from '#lib/utils/markdown';

	type Props = { source: string | null | undefined; class?: string };
	let { source, class: className }: Props = $props();

	const html = $derived(renderMarkdown(source));
</script>

<!--
	The only place `{@html}` is allowed on user-supplied content. `renderMarkdown`
	sanitizes; passing raw HTML here from anywhere else would be stored XSS.
	Prose styles come from @tailwindcss/typography, retinted to our tokens.
-->
<div
	class={cn(
		'prose prose-sm max-w-none',
		'prose-headings:font-semibold prose-headings:text-text',
		'prose-p:text-text prose-strong:text-text prose-li:text-text',
		'prose-a:text-text-accent prose-a:underline-offset-2',
		'prose-code:text-text prose-code:before:content-none prose-code:after:content-none',
		'prose-blockquote:border-l-border prose-blockquote:text-text-muted',
		'prose-hr:border-border',
		className
	)}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by renderMarkdown -->
	{@html html}
</div>
