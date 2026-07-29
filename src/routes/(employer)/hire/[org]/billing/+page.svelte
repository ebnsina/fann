<script lang="ts">
	import Card from '#lib/components/ui/Card.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';
	import { COMPANY_INCLUDED } from '#lib/content/marketing';
	import Checklist from '#lib/components/app/marketing/Checklist.svelte';
</script>

<svelte:head><title>Billing · Fann</title></svelte:head>

<div class="flex flex-col gap-6 p-(--fann-space-page)">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl text-text">Billing</h1>
		<p class="text-sm text-text-muted">What this costs, and what it will cost.</p>
	</div>

	<Card title="Nothing, today" description="Free while Fann is in public beta.">
		<div class="flex flex-col gap-4">
			<p class="text-3xl text-text" data-numeric>$0</p>

			<!--
				The same commitments the public pricing section makes, in the place
				somebody goes looking for a bill. A promise that only appears on a
				marketing page is one the person paying never reads.
			-->
			<div
				class="flex flex-col gap-2 border-t border-dashed border-border pt-4 text-sm text-text-muted"
			>
				<p>
					There is no card on file and no trial running out. Everything below is included, with no
					limits on jobs or team members.
				</p>
				<p>
					When we do start charging it will be for each job you have open, we will tell you well
					before it begins, and we will never charge you for the past.
				</p>
			</div>

			<div class="flex flex-wrap items-center gap-3 border-t border-dashed border-border pt-4">
				<span
					class="flex items-center gap-1.5 border border-border bg-surface-sunken px-2 py-1 text-xs text-text-muted"
				>
					<Icon icon={icons.time} class="size-3.5" />
					Paid plans — coming soon
				</span>
				<span class="text-xs text-text-subtle">
					Nothing to set up here yet. This page will show your plan and invoices when there are any.
				</span>
			</div>
		</div>
	</Card>

	<Card title="What you have now" description="Included, at no cost, during the beta.">
		<Checklist items={COMPANY_INCLUDED} />
	</Card>

	<p class="text-xs text-text-subtle">
		Questions about pricing before it exists? The
		<a href="/for-employers" class="text-text-accent underline-offset-2 hover:underline">
			employer page
		</a>
		says everything we have decided so far, including what is not built yet.
	</p>
</div>
