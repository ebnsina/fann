<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** The pitch. */
		children: Snippet;
		/** The sign-up form, which stays in view while the pitch scrolls past it. */
		panel: Snippet;
	};

	let { children, panel }: Props = $props();
</script>

<!--
	The join-page hero: the case on the left, the form on the right.

	The form is `sticky` from the large breakpoint up, so someone who reads the
	whole page never has to scroll back to find it. On a phone the columns stack in
	source order — the reason to sign up, then the form — which is why the pitch
	here is kept short and the detail lives in the sections below.
-->
<section class="relative border-b border-border">
	<div
		class="mx-auto grid max-w-(--fann-shell-width) gap-12 px-(--fann-space-page) py-16 lg:grid-cols-[1fr_24rem] lg:py-20"
	>
		<div class="fann-reveal flex flex-col gap-8">
			{@render children()}
		</div>

		<div class="lg:sticky lg:top-24 lg:self-start">
			{@render panel()}
		</div>
	</div>
</section>
