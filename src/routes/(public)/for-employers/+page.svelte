<script lang="ts">
	import Faq from '#lib/components/app/marketing/Faq.svelte';
	import ScrollProgress from '#lib/components/app/marketing/ScrollProgress.svelte';
	import FeatureGrid from '#lib/components/app/marketing/FeatureGrid.svelte';
	import Section from '#lib/components/app/marketing/Section.svelte';
	import Steps from '#lib/components/app/marketing/Steps.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import RollingNumber from '#lib/components/ui/RollingNumber.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import {
		COMPANY_COMMITMENTS,
		COMPANY_INCLUDED,
		COMPANY_ROADMAP,
		EMPLOYER_FAQ,
		EMPLOYER_FEATURES,
		EMPLOYER_STEPS
	} from '#lib/content/marketing';
	import Checklist from '#lib/components/app/marketing/Checklist.svelte';
	import { icons } from '#lib/design/icons';
	import { landingStats } from '../landing.remote';

	const stats = $derived(await landingStats());
</script>

<svelte:head>
	<title>Why hire on Fann</title>
	<meta
		name="description"
		content="Post jobs to people who already know what they pay. Free during public beta. We ask you to show the salary and to answer everyone who applies."
	/>
</svelte:head>

<ScrollProgress />

<!-- Hero ------------------------------------------------------------------- -->
<section class="border-b border-border">
	<!-- `fann-drift` lifts and dims the hero as it scrolls away, so the section below
	     arrives on a clean screen rather than sliding over busy text. -->
	<div
		class="fann-drift mx-auto flex max-w-(--fann-shell-width) flex-col gap-8 px-(--fann-space-page) py-20 lg:py-28"
	>
		<div class="flex flex-col gap-6">
			<Badge tone="accent" icon={icons.launch} class="w-fit">Free during public beta</Badge>

			<h1 class="max-w-3xl text-4xl text-text lg:text-5xl">Fewer applicants. Better ones.</h1>

			<p class="max-w-2xl text-lg text-text-muted">
				Showing your salary range turns away everyone the number does not suit — before they apply,
				not after three interviews. What is left is a shorter list of people who saw the figure and
				applied anyway.
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-3">
			<Button href="/join/company" variant="primary" size="lg">
				Start hiring
				<Icon icon={icons.arrowRight} class="size-4" />
			</Button>
			<Button href="/jobs" size="lg">Look at the board first</Button>
		</div>

		<p class="flex items-center gap-2 text-xs text-text-subtle">
			<Icon icon={icons.info} class="size-3.5" />
			{stats.companies} companies are hiring here, with {stats.openRoles} jobs open right now.
		</p>
	</div>
</section>

<!-- The deal --------------------------------------------------------------- -->
<Section
	tinted
	eyebrow="What we ask"
	title="Three things, and we ask them of everyone"
	lead="If any of these is a problem, this is not the right place to post — and it is better we both find that out on this page."
>
	<FeatureGrid features={COMPANY_COMMITMENTS} />
</Section>

<!-- What you get ----------------------------------------------------------- -->
<Section
	eyebrow="What you get"
	title="Somewhere to keep track, not just somewhere to post"
	lead="Everything below works today. What does not is listed further down."
>
	<FeatureGrid features={EMPLOYER_FEATURES} />
</Section>

<!-- How it works ----------------------------------------------------------- -->
<Section tinted eyebrow="Getting started" title="Three steps to your first job post">
	<Steps steps={EMPLOYER_STEPS} />
</Section>

<!-- Pricing ---------------------------------------------------------------- -->
<Section eyebrow="What it costs" title="Nothing, today">
	<div class="grid gap-px border border-border bg-border lg:grid-cols-3">
		<div class="flex flex-col gap-4 bg-surface p-(--fann-space-panel) lg:col-span-2">
			<h3 class="text-base font-semibold text-text">Included right now</h3>
			<Checklist items={COMPANY_INCLUDED} />

			<!-- The gaps sit on the same card as the good parts, because a list of only
			     the good parts gets found out in week one. -->
			<h3 class="mt-4 border-t border-dashed border-border pt-4 text-base font-semibold text-text">
				Not built yet
			</h3>
			<Checklist items={COMPANY_ROADMAP} tone="planned" />
		</div>

		<div class="flex flex-col justify-between gap-4 bg-surface p-(--fann-space-panel)">
			<div class="flex flex-col gap-2">
				<p class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Today</p>
				<p class="text-3xl text-text"><RollingNumber value="$0" /></p>
				<!-- Said plainly: nothing here charges anyone, and implying otherwise would be a lie. -->
				<p class="text-sm text-text-muted">
					No card and no trial timer. When we do start charging it will be for each job you have
					open, we will tell you well before it begins, and we will never charge you for the past.
				</p>
			</div>
			<Button href="/join/company" variant="primary">
				Start hiring
				<Icon icon={icons.arrowRight} class="size-4" />
			</Button>
		</div>
	</div>
</Section>

<!-- FAQ -------------------------------------------------------------------- -->
<Section tinted eyebrow="Questions" title="The ones we actually get asked">
	<Faq items={EMPLOYER_FAQ} />
</Section>

<!-- Final CTA -------------------------------------------------------------- -->
<Section bordered={false}>
	<div class="flex flex-col items-start gap-6">
		<h2 class="max-w-2xl text-2xl text-text lg:text-3xl">
			Post a job to people who already know what it pays.
		</h2>
		<div class="flex flex-wrap items-center gap-3">
			<Button href="/join/company" variant="primary" size="lg">
				Start hiring
				<Icon icon={icons.arrowRight} class="size-4" />
			</Button>
			<Button href="/jobs" size="lg">Look at the board first</Button>
		</div>
	</div>
</Section>
