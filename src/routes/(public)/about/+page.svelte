<script lang="ts">
	import Checklist from '#lib/components/app/marketing/Checklist.svelte';
	import ScrollProgress from '#lib/components/app/marketing/ScrollProgress.svelte';
	import Section from '#lib/components/app/marketing/Section.svelte';
	import Wordmark from '#lib/components/app/Wordmark.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import RollingNumber from '#lib/components/ui/RollingNumber.svelte';
	import { COMPANY_ROADMAP } from '#lib/content/marketing';
	import { CONTACT_EMAIL } from '#lib/content/legal';
	import { icons } from '#lib/design/icons';
	import { formatCompactCurrency } from '#lib/utils/format';
	import { landingStats } from '../landing.remote';

	const stats = $derived(await landingStats());

	/**
	 * What the name means.
	 *
	 * The first reading is a real word: فَنّ (fann) is Arabic for art, craft or
	 * skill, and it carries into Urdu and Persian with the same sense. The other two
	 * are what English ears hear. Confirm the origin you actually intended before
	 * this goes anywhere near a press page.
	 */
	const NAME = [
		{
			icon: icons.craft,
			script: 'فَنّ',
			heading: 'Craft',
			body: 'In Arabic, fann means art or skill — the thing you are good at. Which is the only part of a hiring process anyone should be judged on.'
		},
		{
			icon: icons.enthusiasm,
			script: 'fan',
			heading: 'Fan',
			body: 'It also reads as fan: someone who is genuinely into the work. We would rather match those people to companies than fill a seat.'
		},
		{
			icon: icons.delight,
			script: 'fun',
			heading: 'Fun',
			body: 'And it sounds like fun, which job hunting is not. We cannot fix all of that. We can stop you finding out the salary in the fourth interview.'
		}
	];

	/** The two rules the whole product is built around, stated once, plainly. */
	const RULES = [
		{
			icon: icons.salary,
			title: 'Publish the salary',
			body: 'A job cannot be saved here without a pay range. Not a policy someone can forget — the record will not exist without it.'
		},
		{
			icon: icons.message,
			title: 'Answer everyone',
			body: 'There is no button that closes an application silently. Turning someone down asks for a reason, and they read what was written.'
		}
	];

	const figures = $derived([
		{ label: 'Jobs open', value: String(stats.openRoles) },
		{ label: 'Companies', value: String(stats.companies) },
		{
			label: 'Typical salary',
			value: stats.medianSalary ? formatCompactCurrency(stats.medianSalary) : '—'
		},
		{ label: 'Show their pay', value: '100%' }
	]);
</script>

<svelte:head>
	<title>About Fann</title>
	<meta
		name="description"
		content="Why Fann exists, what the name means, and what is honestly not built yet."
	/>
</svelte:head>

<ScrollProgress />

<!-- Hero ------------------------------------------------------------------- -->
<section class="border-b border-border">
	<div class="mx-auto flex max-w-(--fann-shell-width) flex-col gap-8 px-(--fann-space-page) py-16">
		<Wordmark size="lg" as="text" />

		<div class="flex flex-col gap-5">
			<h1 class="max-w-3xl text-4xl text-text lg:text-5xl">A job board built around two rules.</h1>
			<p class="max-w-2xl text-lg text-text-muted">
				Most of what is wrong with looking for work is not complicated. You cannot find out what a
				job pays, and you never hear back. Both are choices somebody made, and both can be taken
				away as options.
			</p>
		</div>
	</div>
</section>

<!-- The two rules ---------------------------------------------------------- -->
<Section
	tinted
	eyebrow="Why it exists"
	title="Two things, and they are not settings"
	lead="Everything else here — the board, the applicant list, the reply timer — exists to make these two hold in practice rather than in a blog post."
>
	<div class="grid gap-px border border-border bg-border sm:grid-cols-2">
		{#each RULES as rule (rule.title)}
			<article class="flex flex-col gap-3 bg-surface p-(--fann-space-panel)">
				<Icon icon={rule.icon} class="size-5 text-text-accent" />
				<h3 class="text-base font-semibold text-text">{rule.title}</h3>
				<p class="text-sm text-text-muted">{rule.body}</p>
			</article>
		{/each}
	</div>
</Section>

<!-- The name --------------------------------------------------------------- -->
<Section
	eyebrow="The name"
	title="So what does Fann mean?"
	lead="Three answers, and we are not picking between them."
>
	<div class="grid gap-px border border-border bg-border lg:grid-cols-3">
		{#each NAME as reading (reading.heading)}
			<article class="flex flex-col gap-4 bg-surface p-(--fann-space-panel)">
				<div class="flex items-center justify-between gap-4">
					<Icon icon={reading.icon} class="size-5 text-text-accent" />
					<!-- Set large and quiet: it is the word itself, not a label. -->
					<span class="text-2xl text-text-subtle" lang={reading.script === 'فَنّ' ? 'ar' : 'en'}>
						{reading.script}
					</span>
				</div>
				<h3 class="text-base font-semibold text-text">{reading.heading}</h3>
				<p class="text-sm text-text-muted">{reading.body}</p>
			</article>
		{/each}
	</div>

	<p class="flex items-start gap-2 text-sm text-text-muted">
		<Icon icon={icons.info} class="mt-0.5 size-3.5 shrink-0 text-text-subtle" />
		Four letters, one syllable, and nobody has to spell it twice on a phone call. That part was not an
		accident.
	</p>
</Section>

<!-- Where it stands -------------------------------------------------------- -->
<Section tinted eyebrow="Where it stands" title="The board today">
	<dl class="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
		{#each figures as figure (figure.label)}
			<div class="flex flex-col gap-1 bg-surface p-(--fann-space-panel)">
				<dt class="text-2xs font-medium tracking-wide text-text-subtle uppercase">
					{figure.label}
				</dt>
				<dd class="text-2xl text-text">
					<RollingNumber value={figure.value} />
				</dd>
			</div>
		{/each}
	</dl>
</Section>

<!-- What is missing -------------------------------------------------------- -->
<Section
	eyebrow="Being straight"
	title="What is not built yet"
	lead="This list is on the sign-up page too. A product that only lists its good parts gets found out in week one, and the person who signed up is the one who looks foolish."
>
	<div class="border border-border bg-surface p-(--fann-space-panel)">
		<Checklist items={COMPANY_ROADMAP} tone="planned" />
	</div>
</Section>

<!-- Money and contact ------------------------------------------------------ -->
<Section bordered={false} eyebrow="The boring questions" title="Money, and how to reach us">
	<div class="grid gap-px border border-border bg-border sm:grid-cols-2">
		<article class="flex flex-col gap-3 bg-surface p-(--fann-space-panel)">
			<Icon icon={icons.price} class="size-5 text-text-accent" />
			<h3 class="text-base font-semibold text-text">How this gets paid for</h3>
			<p class="text-sm text-text-muted">
				It does not, yet. Fann is free for people looking for work and will stay that way. For
				companies it is free during the public beta; after that it will be per open job, announced
				well before it starts, and never charged for a period that has passed.
			</p>
			<p class="text-sm text-text-muted">
				There is no advertising here and no data being sold, which is the same sentence as the one
				above read from the other end.
			</p>
		</article>

		<article class="flex flex-col gap-3 bg-surface p-(--fann-space-panel)">
			<Icon icon={icons.message} class="size-5 text-text-accent" />
			<h3 class="text-base font-semibold text-text">Getting in touch</h3>
			<p class="text-sm text-text-muted">
				A company behaving badly, a bug, a range that is obviously nonsense — tell us. We read all
				of it.
			</p>
			<p class="text-sm">
				<a
					href="mailto:{CONTACT_EMAIL}"
					class="text-text-accent underline-offset-2 hover:underline"
				>
					{CONTACT_EMAIL}
				</a>
			</p>
			<div class="mt-2 flex flex-wrap gap-3 border-t border-dashed border-border pt-4">
				<Button href="/privacy" size="sm">Privacy</Button>
				<Button href="/terms" size="sm">Terms</Button>
			</div>
		</article>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<Button href="/jobs" variant="primary" size="lg">
			Browse {stats.openRoles} jobs
			<Icon icon={icons.arrowRight} class="size-4" />
		</Button>
		<Button href="/join/company" size="lg">Start hiring</Button>
	</div>
</Section>
