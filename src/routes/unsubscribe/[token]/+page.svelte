<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Email settings · Fann</title>
	<!-- Nothing here should ever be indexed: the URL identifies a person. -->
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="mx-auto flex max-w-lg flex-col gap-6 p-(--fann-space-page)">
	{#if data.result}
		<div class="flex flex-col gap-3 border border-border bg-surface p-(--fann-space-panel)">
			<div class="flex items-center gap-2">
				<Icon icon={icons.check} class="size-5 text-text-accent" />
				<h1 class="text-lg text-text">That is switched off</h1>
			</div>

			<p class="text-sm text-text-muted">
				We will stop emailing you about
				<span class="text-text">{data.result.label.toLowerCase()}</span>.
			</p>

			<!--
				Said plainly, because it is the thing somebody unsubscribing here would
				most reasonably worry about. Muting email must never read as "you will
				stop hearing whether you got the job".
			-->
			<p class="text-sm text-text-muted">
				You will still see these on your notifications page when you sign in — an answer to an
				application is never only an email.
			</p>

			<div class="flex flex-wrap gap-3 pt-1">
				<Button href="/me/settings" variant="primary" size="sm">Change email settings</Button>
				<Button href="/" variant="ghost" size="sm">Back to Fann</Button>
			</div>
		</div>
	{:else}
		<div class="flex flex-col gap-3 border border-border bg-surface p-(--fann-space-panel)">
			<h1 class="text-lg text-text">That link did not work</h1>
			<p class="text-sm text-text-muted">
				It may have been cut in half by your email app. You can change the same settings from your
				account.
			</p>
			<div class="flex flex-wrap gap-3 pt-1">
				<Button href="/me/settings" variant="primary" size="sm">Open email settings</Button>
				<Button href="/" variant="ghost" size="sm">Back to Fann</Button>
			</div>
		</div>
	{/if}
</div>
