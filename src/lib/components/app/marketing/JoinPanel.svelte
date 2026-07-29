<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		/** One line under the title — what happens after they press the button. */
		note: string;
		children: Snippet;
	};

	let { title, note, children }: Props = $props();
</script>

<!--
	The card the sign-up form sits in on a join page.

	Deliberately plain: a form is the one thing on these pages that should look
	like work rather than marketing, and a heavier treatment here would compete
	with the button inside it.
-->
<!-- `id` so a call-to-action further down the page can point back at the form. -->
<div id="join" class="flex flex-col gap-5 border border-border bg-surface p-(--fann-space-panel)">
	<div class="flex flex-col gap-1">
		<h2 class="text-lg font-semibold text-text">{title}</h2>
		<p class="text-sm text-text-muted">{note}</p>
	</div>

	{@render children()}

	<p class="border-t border-dashed border-border pt-4 text-sm text-text-muted">
		Already have an account?
		<a href="/login" class="text-text-accent underline-offset-2 hover:underline">Sign in</a>
	</p>
</div>
