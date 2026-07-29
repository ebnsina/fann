<script lang="ts">
	import LegalPage from '#lib/components/app/marketing/LegalPage.svelte';
	import { LEGAL_UPDATED, TERMS } from '#lib/content/legal';
</script>

<svelte:head>
	<title>Terms · Fann</title>
	<meta
		name="description"
		content="The rules for using Fann, including the two we ask every company to keep: publish the salary, and answer everyone who applies."
	/>
</svelte:head>

<LegalPage
	title="Terms"
	lead="The rules for using Fann — including the two we ask of every company that posts here."
	updated={LEGAL_UPDATED}
	sections={TERMS}
/>
