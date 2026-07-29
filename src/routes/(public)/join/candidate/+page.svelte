<script lang="ts">
	import Faq from '#lib/components/app/marketing/Faq.svelte';
	import FeatureGrid from '#lib/components/app/marketing/FeatureGrid.svelte';
	import JoinPanel from '#lib/components/app/marketing/JoinPanel.svelte';
	import ScrollProgress from '#lib/components/app/marketing/ScrollProgress.svelte';
	import Section from '#lib/components/app/marketing/Section.svelte';
	import SplitHero from '#lib/components/app/marketing/SplitHero.svelte';
	import Steps from '#lib/components/app/marketing/Steps.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import FormActions from '#lib/components/ui/FormActions.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import {
		CANDIDATE_FAQ,
		CANDIDATE_JOIN_BENEFITS,
		CANDIDATE_JOIN_STEPS,
		CANDIDATE_PROMISES
	} from '#lib/content/marketing';
	import { icons } from '#lib/design/icons';
	import { landingStats } from '../../landing.remote';
	import { joinAsCandidate as form } from '../join.remote';

	const stats = $derived(await landingStats());

	// `.preflight(signupSchema)` belongs on this form. It is left off because in
	// kit@3.0.0-next.12 the touched-tracking that gates issue display throws
	// `state_unsafe_mutation` from Kit's own focusout handler, so preflight blocks
	// submission without ever showing why. The server validates the same schema.

	const HEADLINES = [
		'Every job shows what it pays, before you apply',
		'Every application gets an answer, with a reason',
		'Free, and we never sell your details'
	];
</script>

<svelte:head>
	<title>Find a job on Fann — create your account</title>
	<meta
		name="description"
		content="Every job on Fann shows what it pays, and every application gets an answer. Free to join, and your CV is only ever seen by the companies you send it to."
	/>
</svelte:head>

<ScrollProgress />

<SplitHero>
	<Badge tone="accent" icon={icons.salary} class="w-fit">Pay shown on every job</Badge>

	<div class="flex flex-col gap-5">
		<h1 class="text-4xl text-text lg:text-5xl">Stop guessing what a job pays</h1>
		<p class="max-w-xl text-lg text-text-muted">
			Every job here shows its salary before you apply, and every company here has to answer you —
			with a reason if the answer is no. You will know where you stand, and how long you have been
			waiting.
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
		{stats.openRoles} jobs open across {stats.companies} companies, all of them showing their pay.
	</p>

	{#snippet panel()}
		<JoinPanel
			title="Create your account"
			note="Takes about a minute, and you do not need your CV to hand yet."
		>
			<form {...form} class="flex flex-col gap-4">
				<FormError issues={form.fields.allIssues()} />

				<Field label="Your name" issues={form.fields.name.issues()}>
					{#snippet children(control)}
						<Input {...control} {...form.fields.name.as('text')} autocomplete="name" />
					{/snippet}
				</Field>

				<Field label="Email" issues={form.fields.email.issues()}>
					{#snippet children(control)}
						<Input
							{...control}
							{...form.fields.email.as('email')}
							autocomplete="email"
							placeholder="you@example.com"
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
					Free, and your profile stays private until you say otherwise.
				</p>
			</form>
		</JoinPanel>
	{/snippet}
</SplitHero>

<!-- What you get ----------------------------------------------------------- -->
<Section
	tinted
	eyebrow="What you get"
	title="The things you should not have to ask for"
	lead="On most job boards these are settings a company can switch off. Here they are simply how it works."
>
	<FeatureGrid features={CANDIDATE_JOIN_BENEFITS} />
</Section>

<!-- How it works ----------------------------------------------------------- -->
<Section eyebrow="How it works" title="From signing up to your first application">
	<Steps steps={CANDIDATE_JOIN_STEPS} />
</Section>

<!-- Promises --------------------------------------------------------------- -->
<Section
	tinted
	eyebrow="Your details"
	title="What we will never do with them"
	lead="A CV is a list of everywhere you have worked and how to reach you. It should not end up in a database you never agreed to."
>
	<FeatureGrid features={CANDIDATE_PROMISES} />
</Section>

<!-- FAQ -------------------------------------------------------------------- -->
<Section eyebrow="Questions" title="Before you sign up">
	<Faq items={CANDIDATE_FAQ} />
</Section>

<!-- Final CTA -------------------------------------------------------------- -->
<Section bordered={false}>
	<div class="flex flex-col items-start gap-6">
		<h2 class="max-w-2xl text-2xl text-text lg:text-3xl">
			Have a look around first, if you would rather.
		</h2>
		<div class="flex flex-wrap items-center gap-3">
			<Button href="/jobs" variant="primary" size="lg">
				Browse {stats.openRoles} jobs
				<Icon icon={icons.arrowRight} class="size-4" />
			</Button>
			<Button href="#join" size="lg">Create an account</Button>
		</div>
	</div>
</Section>
