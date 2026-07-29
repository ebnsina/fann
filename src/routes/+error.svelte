<script lang="ts">
	import { page } from '$app/state';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';

	// A 404 is a wrong turn, not a breakage. Telling someone who mistyped a URL
	// that something went wrong is both untrue and mildly alarming.
	const isNotFound = $derived(page.status === 404);

	const title = $derived(isNotFound ? 'We could not find that page' : 'Something went wrong');

	const description = $derived(
		isNotFound
			? 'The link may be out of date, or the page may have moved. The jobs board is a good place to pick things up.'
			: (page.error?.message ?? 'Please try again. If it keeps happening, let us know.')
	);

	/** Present only for unexpected failures — see `handleError` in hooks.server.ts. */
	const reference = $derived(page.error?.reference);
</script>

<svelte:head><title>{title} · Fann</title></svelte:head>

<div class="flex min-h-svh items-center justify-center p-(--fann-space-page)">
	<div class="flex max-w-md flex-col items-start gap-5">
		<p class="font-mono text-xs text-text-subtle tabular-nums" data-numeric>{page.status}</p>

		<div class="flex flex-col gap-2">
			<h1 class="text-2xl text-text">{title}</h1>
			<p class="text-sm text-text-muted">{description}</p>
		</div>

		{#if reference}
			<!--
				Shown, not just logged: this is the one thing that turns "it broke" into
				a report somebody can actually act on.
			-->
			<p
				class="flex flex-wrap items-center gap-2 border border-dashed border-border p-(--fann-space-control) text-xs text-text-muted"
			>
				<Icon icon={icons.info} class="size-3.5 shrink-0" />
				Quote this if you get in touch:
				<span class="font-mono text-text select-all" data-numeric>{reference}</span>
			</p>
		{/if}

		<div class="flex flex-wrap items-center gap-2">
			<Button href="/jobs" variant="primary">
				Browse jobs
				<Icon icon={icons.arrowRight} class="size-3.5" />
			</Button>
			{#if isNotFound}
				<Button href="/">Go to the home page</Button>
			{:else}
				<Button onclick={() => location.reload()}>Try again</Button>
			{/if}
		</div>
	</div>
</div>
