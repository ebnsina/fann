<script lang="ts">
	import SiteChrome from '#lib/components/app/SiteChrome.svelte';

	let { children } = $props();
</script>

<SiteChrome>
	{@render children()}
</SiteChrome>
