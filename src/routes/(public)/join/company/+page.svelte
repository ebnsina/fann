<script lang="ts">
	import { joinCompanySchema } from '#lib/schemas/join';
	import Form from '#lib/components/ui/Form.svelte';
	import Checklist from '#lib/components/app/marketing/Checklist.svelte';
	import Comparison from '#lib/components/app/marketing/Comparison.svelte';
	import Faq from '#lib/components/app/marketing/Faq.svelte';
	import FeatureGrid from '#lib/components/app/marketing/FeatureGrid.svelte';
	import JoinPanel from '#lib/components/app/marketing/JoinPanel.svelte';
	import ScrollProgress from '#lib/components/app/marketing/ScrollProgress.svelte';
	import Section from '#lib/components/app/marketing/Section.svelte';
	import SplitHero from '#lib/components/app/marketing/SplitHero.svelte';
	import Steps from '#lib/components/app/marketing/Steps.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import RollingNumber from '#lib/components/ui/RollingNumber.svelte';
	import FormActions from '#lib/components/ui/FormActions.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import {
		COMPANY_COMMITMENTS,
		COMPANY_COMPARISON,
		COMPANY_INCLUDED,
		COMPANY_JOIN_BENEFITS,
		COMPANY_JOIN_STEPS,
		COMPANY_ROADMAP,
		EMPLOYER_FAQ
	} from '#lib/content/marketing';
	import { icons } from '#lib/design/icons';
	import { landingStats } from '../../landing.remote';
	import { joinAsCompany as form } from '../join.remote';

	const stats = $derived(await landingStats());

	// `.preflight(joinCompanySchema)` belongs on this form. It is left off because
	// in kit@3.0.0-next.12 the touched-tracking that gates issue display throws
	// `state_unsafe_mutation` from Kit's own focusout handler, so preflight blocks
	// submission without ever showing why. The server validates the same schema.

	/** The three short lines in the hero. The full case is further down the page. */
	const HEADLINES = [
		'Free to post, with no limit on jobs or team members',
		'Everyone who applies lands in one shared list',
		'Show the pay and get a shorter, better shortlist'
	];

	// Client-side validation using the same schema the server enforces.
	form.preflight(joinCompanySchema);
</script>

<svelte:head>
	<title>Post jobs on Fann — sign up your company</title>
	<meta
		name="description"
		content="Set your company up on Fann and post jobs to people who already know what they pay. Free during public beta, with no limit on jobs or team members."
	/>
</svelte:head>

<ScrollProgress />

<SplitHero>
	<Badge tone="accent" icon={icons.launch} class="w-fit">Free during public beta</Badge>

	<div class="flex flex-col gap-5">
		<h1 class="text-4xl text-text lg:text-5xl">Start hiring on Fann</h1>
		<p class="max-w-xl text-lg text-text-muted">
			Post a job, and the people who apply already know what it pays. You spend your time reading a
			shorter list instead of turning down people the salary was never going to suit.
		</p>
	</div>

	<ul class="flex flex-col gap-3">
		{#each HEADLINES as headline (headline)}
			<li class="flex items-start gap-2.5 text-base text-text">
				<Icon icon={icons.check} class="mt-1 size-4 shrink-0 text-success" />
				{headline}
			</li>
		{/each}
	</ul>

	<p class="flex items-center gap-2 text-xs text-text-subtle">
		<Icon icon={icons.info} class="size-3.5" />
		{stats.companies} companies are hiring here, with {stats.openRoles} jobs open right now.
	</p>

	{#snippet panel()}
		<JoinPanel
			title="Create your account"
			note="Takes about a minute. We will email you a link to confirm it is you."
		>
			<Form {form} class="flex flex-col gap-4">
				<FormError issues={form.fields.allIssues()} />

				<Field label="Your name" issues={form.fields.name.issues()}>
					{#snippet children(control)}
						<Input {...control} {...form.fields.name.as('text')} autocomplete="name" />
					{/snippet}
				</Field>

				<Field label="Company name" issues={form.fields.company.issues()}>
					{#snippet children(control)}
						<Input
							{...control}
							{...form.fields.company.as('text')}
							autocomplete="organization"
							placeholder="Acme Inc"
						/>
					{/snippet}
				</Field>

				<Field label="Work email" issues={form.fields.email.issues()}>
					{#snippet children(control)}
						<Input
							{...control}
							{...form.fields.email.as('email')}
							autocomplete="email"
							placeholder="you@acme.com"
						/>
					{/snippet}
				</Field>

				<Field
					label="Password"
					issues={form.fields._password.issues()}
					hint="At least 12 characters. Length helps more than symbols do."
				>
					{#snippet children(control)}
						<Input
							{...control}
							{...form.fields._password.as('password')}
							autocomplete="new-password"
						/>
					{/snippet}
				</Field>

				<FormActions>
					<Button type="submit" variant="primary" size="lg" loading={form.pending > 0}>
						Create account
						<Icon icon={icons.arrowRight} class="size-4" />
					</Button>
				</FormActions>

				<p class="text-xs text-text-subtle">
					No card needed. Nothing appears publicly until you write and publish a job.
				</p>
			</Form>
		</JoinPanel>
	{/snippet}
</SplitHero>

<!-- What you get ----------------------------------------------------------- -->
<Section
	tinted
	eyebrow="What you get"
	title="Everything below is free, and there is no catch to find"
	lead="No trial timer, no card, and no limit on how many jobs you post or how many colleagues you add."
>
	<FeatureGrid features={COMPANY_JOIN_BENEFITS} />
</Section>

<!-- The deal --------------------------------------------------------------- -->
<Section
	eyebrow="What we ask"
	title="Three things, and we ask them of everyone"
	lead="If any of these is a problem, this is not the right place to post — and it is better we both find that out on this page."
>
	<FeatureGrid features={COMPANY_COMMITMENTS} />
</Section>

<!-- Getting started -------------------------------------------------------- -->
<Section tinted eyebrow="Getting started" title="Four steps to your first job post">
	<Steps steps={COMPANY_JOIN_STEPS} />
</Section>

<!-- Comparison ------------------------------------------------------------- -->
<Section
	eyebrow="Side by side"
	title="How this is different from where you post now"
	lead="Every line in the Fann column is something you can do today."
>
	<Comparison rows={COMPANY_COMPARISON} />
</Section>

<!-- Pricing + honesty ------------------------------------------------------ -->
<Section tinted eyebrow="What it costs" title="Nothing, today">
	<div class="grid gap-px border border-border bg-border lg:grid-cols-3">
		<div class="flex flex-col gap-4 bg-surface p-(--fann-space-panel) lg:col-span-2">
			<h3 class="text-base font-semibold text-text">Included right now</h3>
			<Checklist items={COMPANY_INCLUDED} />

			<!--
				The gaps, on the same card as the good parts. A join page that lists
				only what works gets found out in week one, and the person who signed
				up is the one who looks foolish in front of their team.
			-->
			<h3 class="mt-4 border-t border-dashed border-border pt-4 text-base font-semibold text-text">
				Not built yet
			</h3>
			<Checklist items={COMPANY_ROADMAP} tone="planned" />
		</div>

		<div class="flex flex-col justify-between gap-4 bg-surface p-(--fann-space-panel)">
			<div class="flex flex-col gap-2">
				<p class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Today</p>
				<p class="text-3xl text-text"><RollingNumber value="$0" /></p>
				<p class="text-sm text-text-muted">
					When we do start charging, it will be for each job you have open, we will tell you well
					before it begins, and we will never charge you for the past.
				</p>
			</div>
			<Button href="#join" variant="primary">
				Create your account
				<Icon icon={icons.arrowRight} class="size-4" />
			</Button>
		</div>
	</div>
</Section>

<!-- FAQ -------------------------------------------------------------------- -->
<Section bordered={false} eyebrow="Questions" title="The ones we actually get asked">
	<Faq items={EMPLOYER_FAQ} />
</Section>
