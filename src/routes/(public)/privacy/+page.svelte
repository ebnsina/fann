<script lang="ts">
	import LegalPage from '#lib/components/app/marketing/LegalPage.svelte';
	import { LEGAL_UPDATED, PRIVACY } from '#lib/content/legal';
</script>

<svelte:head>
	<title>Privacy · Fann</title>
	<meta
		name="description"
		content="What Fann collects, who can see your CV, and what we will never do with your details."
	/>
</svelte:head>

<LegalPage
	title="Privacy"
	lead="What we collect, who can see it, and what we will never do with it."
	updated={LEGAL_UPDATED}
	sections={PRIVACY}
/>
