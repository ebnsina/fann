<script lang="ts">
	import Card from '#lib/components/ui/Card.svelte';
	import { platformOverview } from './admin.remote';

	const stats = $derived(await platformOverview());

	/**
	 * Deliberately not a vanity dashboard.
	 *
	 * Sign-ups and page views tell staff nothing they can act on. These are the
	 * figures that say whether the product is keeping its own promise, and each
	 * one has something a person could do about it.
	 */
	const FIGURES = $derived([
		{ label: 'People', value: stats.users },
		{ label: 'Companies', value: stats.companies },
		{ label: 'Jobs on the board', value: stats.publishedJobs },
		{ label: 'Applications', value: stats.applications },
		{ label: 'Answered', value: stats.answered },
		{ label: 'Posts', value: stats.posts }
	]);
</script>

<svelte:head><title>Platform · Fann</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl text-text">Platform</h1>
		<p class="text-sm text-text-muted">
			How the product is doing against the two things it promises.
		</p>
	</div>

	<!--
		The two numbers that mean somebody should do something, given their own row
		above the rest. Everything below is context for them.
	-->
	<div class="grid gap-px border border-border bg-border sm:grid-cols-2">
		<div class="flex flex-col gap-1 bg-surface p-(--fann-space-panel)">
			<p class="text-2xs font-medium tracking-wide text-text-subtle uppercase">
				Left waiting past 14 days
			</p>
			<p class="text-3xl {stats.awaitingAnswer > 0 ? 'text-warning' : 'text-text'}" data-numeric>
				{stats.awaitingAnswer}
			</p>
			<p class="text-xs text-text-subtle">
				Applications with no reply, outside the grace window. This is the number the whole product
				argues about.
			</p>
		</div>

		<div class="flex flex-col gap-1 bg-surface p-(--fann-space-panel)">
			<p class="text-2xs font-medium tracking-wide text-text-subtle uppercase">
				Email that failed this week
			</p>
			<p class="text-3xl {stats.emailsFailed > 0 ? 'text-danger' : 'text-text'}" data-numeric>
				{stats.emailsFailed}
			</p>
			<p class="text-xs text-text-subtle">
				A silently failing provider looks exactly like a working one from everywhere else.
			</p>
		</div>
	</div>

	<Card title="Everything else" description="Counts, for context.">
		<dl class="grid gap-px border border-border bg-border sm:grid-cols-3">
			{#each FIGURES as figure (figure.label)}
				<div class="flex flex-col gap-0.5 bg-surface p-(--fann-space-control)">
					<dt class="text-xs text-text-muted">{figure.label}</dt>
					<dd class="text-lg text-text" data-numeric>{figure.value}</dd>
				</div>
			{/each}
		</dl>
	</Card>
</div>
