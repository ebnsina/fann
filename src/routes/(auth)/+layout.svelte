<script lang="ts">
	import Wordmark from '#lib/components/app/Wordmark.svelte';
	import Toaster from '#lib/components/ui/Toaster.svelte';

	let { children } = $props();
</script>

<!--
	Auth sits outside the app shell on purpose: no sidebar, no command palette,
	nothing to navigate to. One task per screen.
-->
<div class="flex min-h-svh flex-col">
	<header class="flex h-(--fann-topbar-height) items-center px-(--fann-space-page)">
		<Wordmark />
	</header>

	<main class="flex flex-1 items-start justify-center px-(--fann-space-page) py-12">
		<div class="w-full max-w-sm">
			{@render children()}
		</div>
	</main>
</div>

<Toaster />
