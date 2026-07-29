<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { shortcuts } from '#lib/shortcuts.svelte';
	import { theme } from '#lib/theme.svelte';

	let { children } = $props();

	$effect(() => theme.watch());

	// Single writer for the `dark` class. The inline script in app.html sets the
	// initial value pre-paint; from here on this is the only thing that changes it.
	$effect(() => {
		document.documentElement.classList.toggle('dark', theme.resolved === 'dark');
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<svelte:window onkeydown={shortcuts.handle} />

{@render children()}
