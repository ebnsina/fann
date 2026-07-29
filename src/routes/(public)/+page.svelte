<script lang="ts">
	import { page } from '$app/state';
	import Faq from '#lib/components/app/marketing/Faq.svelte';
	import PayLegend from '#lib/components/app/PayLegend.svelte';
	import PayRange from '#lib/components/app/PayRange.svelte';
	import VerifiedMark from '#lib/components/app/VerifiedMark.svelte';
	import SalaryDistribution from '#lib/components/app/marketing/SalaryDistribution.svelte';
	import ScrollProgress from '#lib/components/app/marketing/ScrollProgress.svelte';
	import FeatureGrid from '#lib/components/app/marketing/FeatureGrid.svelte';
	import Section from '#lib/components/app/marketing/Section.svelte';
	import Steps from '#lib/components/app/marketing/Steps.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import RollingNumber from '#lib/components/ui/RollingNumber.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import {
		CANDIDATE_FAQ,
		CANDIDATE_FEATURES,
		CANDIDATE_STEPS,
		EMPLOYER_STEPS
	} from '#lib/content/marketing';
	import { icons } from '#lib/design/icons';
	import { employmentTypeIcon, responsePromiseIcon, workModeIcon } from '#lib/design/job-icons';
	import { formatCompactCurrency, formatSalaryRange, label } from '#lib/utils/format';
	import { featuredJobs, landingStats, payHighlights, salaryDistribution } from './landing.remote';

	const stats = $derived(await landingStats());
	const jobs = $derived(await featuredJobs());
	const pay = $derived(await salaryDistribution());
	const highlights = $derived(await payHighlights());

	// One scale across the rows, so the bars compare roles rather than each being
	// drawn to its own width.
	const payScaleMin = $derived(
		highlights.length ? Math.min(...highlights.map((row) => row.p10)) * 0.95 : 0
	);
	const payScaleMax = $derived(
		highlights.length ? Math.max(...highlights.map((row) => row.p90)) * 1.05 : 1
	);

	// "100%" is not marketing rounding — the two pay columns cannot be left empty, so
	// a job without a salary range cannot be saved in the first place.
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
	<title>Fann — every job shows what it pays</title>
	<meta
		name="description"
		content="A job board where every job shows what it pays, and everyone who applies gets an answer. {stats.openRoles} jobs open across {stats.companies} companies."
	/>
</svelte:head>

<ScrollProgress />

{#if page.url.searchParams.has('closed')}
	<!--
		The only acknowledgement somebody gets that their account is gone — they can
		no longer sign in to be told anywhere else. Worth a line on the page they
		land on rather than a silent redirect that looks like being logged out.
	-->
	<div class="mx-auto max-w-(--fann-shell-width) px-(--fann-space-page) pt-6">
		<p
			class="flex items-center gap-2 border border-border bg-surface px-3 py-2 text-sm text-text-muted"
		>
			<Icon icon={icons.verified} class="size-4 text-success" />
			Your account is closed. Thank you for using Fann.
		</p>
	</div>
{/if}

<!-- Hero ------------------------------------------------------------------- -->
<!--
	The chart is the hero image, and it is drawn from the jobs table rather than
	designed. A picture that would be wrong the moment the headline stopped being
	true is worth more here than any amount of texture.
-->
<section class="border-b border-border">
	<div
		class="mx-auto flex max-w-(--fann-shell-width) flex-col gap-8 px-(--fann-space-page) py-12 lg:py-16"
	>
		<div class="flex flex-col gap-6">
			<!-- `w-fit`: a flex-column child stretches to the container by default. -->
			<Badge tone="accent" icon={icons.launch} class="w-fit">Free during public beta</Badge>

			<h1 class="max-w-3xl text-4xl text-text lg:text-5xl">Every job here shows what it pays.</h1>

			<p class="max-w-2xl text-lg text-text-muted">
				And everyone who applies gets an answer, with a reason if the answer is no. Both are built
				into how Fann works, rather than promised somewhere and forgotten.
			</p>
		</div>

		{#if pay.jobs.length > 0}
			<SalaryDistribution jobs={pay.jobs} currency={pay.currency} omitted={pay.omitted} />
		{/if}

		<div class="flex flex-wrap items-center gap-3">
			<Button href="/jobs" variant="primary" size="lg">
				Browse {stats.openRoles} jobs
				<Icon icon={icons.arrowRight} class="size-4" />
			</Button>
			<Button href="/join/company" size="lg">
				I'm hiring
				<Icon icon={icons.arrowRight} class="size-4" />
			</Button>
		</div>
	</div>
</section>

<!-- Live figures ----------------------------------------------------------- -->
<section class="border-b border-border bg-surface">
	<dl class="mx-auto grid max-w-(--fann-shell-width) grid-cols-2 gap-px bg-border lg:grid-cols-4">
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
</section>

<!-- What you get ----------------------------------------------------------- -->
<Section
	eyebrow="For people looking"
	title="Six things you should not have to ask for"
	lead="On most job boards these are settings a company can switch off. Here they are simply how it works."
>
	<FeatureGrid features={CANDIDATE_FEATURES} />
</Section>

<!-- How it works ----------------------------------------------------------- -->
<Section tinted eyebrow="How it works" title="Search, apply, and actually hear back">
	<Steps steps={CANDIDATE_STEPS} />
</Section>

<!-- Live roles ------------------------------------------------------------- -->
{#if jobs.length > 0}
	<Section title="Posted recently">
		{#snippet aside()}
			<Button href="/jobs" variant="link">
				See all {stats.openRoles}
				<Icon icon={icons.arrowRight} class="size-3.5" />
			</Button>
		{/snippet}

		<div class="grid gap-px border border-border bg-border lg:grid-cols-2">
			{#each jobs as job (job.slug)}
				<a
					href="/jobs/{job.slug}"
					class="group flex flex-col gap-3 bg-surface p-(--fann-space-panel) transition-colors hover:bg-surface-hover"
				>
					<div class="flex items-start justify-between gap-4">
						<div class="flex min-w-0 flex-col gap-0.5">
							<h3 class="truncate text-base font-medium text-text group-hover:text-text-accent">
								{job.title}
							</h3>
							<p class="flex min-w-0 items-center gap-1.5 text-sm text-text-muted">
								{#if job.companyVerified}
									<VerifiedMark />
								{/if}
								<span class="truncate">{job.companyName}</span>
							</p>
						</div>
						<p class="shrink-0 font-mono text-sm text-text tabular-nums" data-numeric>
							{formatSalaryRange(
								job.salaryMin,
								job.salaryMax,
								job.salaryCurrency,
								job.salaryPeriod
							)}
						</p>
					</div>

					<div class="flex flex-wrap items-center gap-2">
						<Badge icon={workModeIcon(job.workMode)}>{label(job.workMode)}</Badge>
						<Badge icon={employmentTypeIcon(job.employmentType)}>
							{label(job.employmentType)}
						</Badge>
						{#if job.responseSlaDays}
							<!-- A promise, not a record. See JobCard. -->
							<Badge icon={responsePromiseIcon()}>
								Promises {job.responseSlaDays}d
							</Badge>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	</Section>
{/if}

<!--
	A testimonials section belongs here, and `Testimonials.svelte` is ready for it.
	It is not rendered because we do not have any real quotes yet, and the only two
	honest options are a real quote or no section — a made-up one presented as a
	customer's words is a lie whether or not it carries a disclaimer.

	Add `TESTIMONIALS` back to `marketing.ts` with quotes you have permission to
	publish, then render `<Testimonials {testimonials} />` in this slot.
-->

<!-- What the market pays --------------------------------------------------- -->
{#if highlights.length > 0}
	<Section
		tinted
		eyebrow="What jobs pay"
		title="Not just the number — whether it is a good one"
		lead="Every range published here adds up to a picture of what each kind of work actually pays. Each listing then shows where it sits against that."
	>
		{#snippet aside()}
			<Button href="/salaries" variant="link">
				See every role
				<Icon icon={icons.arrowRight} class="size-3.5" />
			</Button>
		{/snippet}

		<!--
			Real published benchmarks, not an illustration. A made-up example of "what
			this role pays" on a page arguing for pay transparency would undo the
			argument it is making.
		-->
		<div class="flex flex-col border border-border">
			{#each highlights as row (row.occupationId + row.experienceLevel)}
				<div
					class="grid grid-cols-1 items-center gap-3 border-b border-border bg-surface p-(--fann-space-panel) last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
				>
					<div class="flex flex-col gap-1">
						<span class="text-sm font-medium text-text">{row.occupationName}</span>
						<span class="flex items-center gap-2 text-xs text-text-subtle">
							<Badge>{label(row.experienceLevel)}</Badge>
							from <span data-numeric>{row.sampleSize}</span> jobs
						</span>
					</div>

					<div class="flex items-center gap-4">
						<span class="w-20 shrink-0 text-sm text-text" data-numeric>
							{formatCompactCurrency(row.p50, row.currency)}
						</span>
						<div class="min-w-0 flex-1">
							<PayRange {...row} scaleMin={payScaleMin} scaleMax={payScaleMax} />
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- The key indented into the same column as the bars it names. -->
		<div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
			<div class="hidden sm:block"></div>
			<div class="flex items-center gap-4">
				<span class="hidden w-20 shrink-0 sm:block"></span>
				<div class="min-w-0 flex-1"><PayLegend /></div>
			</div>
		</div>

		<p class="mt-3 max-w-2xl text-xs text-text-subtle">
			Nothing is published for a role until at least eight jobs are behind it.
		</p>
	</Section>
{/if}

<!-- Employers -------------------------------------------------------------- -->
<Section eyebrow="For companies" title="Hiring on Fann">
	<div class="flex flex-col gap-8">
		<Steps steps={EMPLOYER_STEPS} />

		<div class="flex flex-wrap items-center gap-3">
			<Button href="/join/company" variant="primary" size="lg">
				Start hiring
				<Icon icon={icons.arrowRight} class="size-4" />
			</Button>
			<Button href="/for-employers" size="lg">See how it works first</Button>
		</div>

		<p class="flex items-center gap-2 text-xs text-text-subtle">
			<Icon icon={icons.info} class="size-3.5" />
			{stats.withResponsePromise} of the {stats.openRoles} jobs open right now say how quickly they will
			reply.
		</p>
	</div>
</Section>

<!-- FAQ -------------------------------------------------------------------- -->
<Section tinted bordered={false} eyebrow="Questions" title="Before you sign up">
	<Faq items={CANDIDATE_FAQ} />
</Section>
