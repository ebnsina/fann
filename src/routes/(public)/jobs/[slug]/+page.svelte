<script lang="ts">
	import { page } from '$app/state';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Markdown from '#lib/components/ui/Markdown.svelte';
	import ResponseCard from '#lib/components/app/ResponseCard.svelte';
	import PayComparison from '#lib/components/app/PayComparison.svelte';
	import SaveJobButton from '#lib/components/app/SaveJobButton.svelte';
	import VerifiedMark from '#lib/components/app/VerifiedMark.svelte';
	import { toast } from '#lib/components/ui/toast.svelte';
	import {
		employmentTypeIcon,
		experienceLevelIcon,
		responsePromiseIcon,
		workModeIcon
	} from '#lib/design/job-icons';
	import { formatRelativeTime, formatSalaryRange, label } from '#lib/utils/format';
	import { markdownToText } from '#lib/utils/markdown';
	import { getJob } from '../jobs.remote';
	import { isSaved, toggleSaved } from '../../../(candidate)/saved.remote';
	import { currentUser } from '../../../(auth)/auth.remote';

	// `params.slug` is typed optional because the type covers every route; on this
	// one the router guarantees it, and the query 404s on anything unknown anyway.
	const job = $derived(await getJob(page.params.slug ?? ''));

	// The same query the header uses, rather than `page.data` — nothing puts the
	// user there, so reading it would silently mean "signed out" for everyone.
	const signedIn = $derived(Boolean(await currentUser()));
	const saved = $derived(signedIn ? await isSaved(job.id) : false);

	let saving = $state(false);

	async function toggleSave() {
		saving = true;
		try {
			const result = await toggleSaved(job.id);
			toast.success(result.saved ? 'Saved.' : 'Removed from saved jobs.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not save that.');
		} finally {
			saving = false;
		}
	}

	// Salary leads the snippet, because it is the thing most listings hide.
	const metaDescription = $derived(
		`${job.title} at ${job.company.name} — ${formatSalaryRange(
			job.salaryMin,
			job.salaryMax,
			job.salaryCurrency,
			job.salaryPeriod
		)}. ${markdownToText(job.description, 120)}`
	);

	/**
	 * schema.org JobPosting, which is how Google Jobs and similar aggregators index
	 * listings. `baseSalary` is always present — the whole point of the product — and
	 * that alone puts these listings ahead of most of what they sit beside.
	 */
	const jsonLd = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'JobPosting',
			title: job.title,
			description: job.description,
			datePosted: job.publishedAt?.toISOString(),
			validThrough: job.closesAt?.toISOString(),
			employmentType: job.employmentType.toUpperCase(),
			hiringOrganization: {
				'@type': 'Organization',
				name: job.company.name,
				sameAs: job.company.websiteUrl ?? undefined
			},
			baseSalary: {
				'@type': 'MonetaryAmount',
				currency: job.salaryCurrency,
				value: {
					'@type': 'QuantitativeValue',
					minValue: job.salaryMin,
					maxValue: job.salaryMax,
					unitText: job.salaryPeriod.toUpperCase()
				}
			},
			jobLocationType: job.workMode === 'remote' ? 'TELECOMMUTE' : undefined
		})
			// `JSON.stringify` does not escape angle brackets, so a description
			// containing a closing script tag would terminate the ld+json block early
			// and everything after it would be parsed as markup. Escaping them closes
			// that hole, and the sequences remain valid JSON that decodes back to the
			// original text. Plain strings rather than regex literals: a slash-gt-slash
			// literal trips the Svelte template parser.
			.replaceAll('<', '\\u003c')
			.replaceAll('>', '\\u003e')
	);
</script>

<svelte:head>
	<title>{job.title} at {job.company.name} · Fann</title>
	<meta name="description" content={metaDescription} />
	<!--
		The escaped closing tag is required, not cosmetic: an unescaped one terminates
		the surrounding block for both the Svelte compiler and the ESLint parser.
		`jsonLd` has its own angle brackets escaped, so nothing in the payload can
		break out either.
	-->
	<!-- eslint-disable-next-line svelte/no-at-html-tags, no-useless-escape -->
	{@html `<script type="application/ld+json">${jsonLd}<\/script>`}
</svelte:head>

<div class="mx-auto flex max-w-4xl flex-col gap-6 p-(--fann-space-page)">
	<nav class="text-xs text-text-subtle">
		<a href="/jobs" class="underline-offset-2 hover:text-text hover:underline">Jobs</a>
		<span aria-hidden="true"> / </span>
		<a
			href="/companies/{job.company.slug}"
			class="underline-offset-2 hover:text-text hover:underline"
		>
			{job.company.name}
		</a>
	</nav>

	<header class="flex flex-col gap-4">
		<div class="flex flex-col gap-2">
			<h1 class="text-3xl text-text">{job.title}</h1>
			<p class="flex flex-wrap items-center gap-1.5 text-base text-text-muted">
				{#if job.company.verified}
					<VerifiedMark size="md" />
				{/if}
				<a href="/companies/{job.company.slug}" class="underline-offset-2 hover:underline">
					{job.company.name}
				</a>
				{#if job.company.tagline}
					<span class="text-text-subtle"> — {job.company.tagline}</span>
				{/if}
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<Badge icon={workModeIcon(job.workMode)}>{label(job.workMode)}</Badge>
			<Badge icon={employmentTypeIcon(job.employmentType)}>{label(job.employmentType)}</Badge>
			<Badge icon={experienceLevelIcon()}>{label(job.experienceLevel)}</Badge>
			{#if job.responseSlaDays}
				<!-- A promise, not a record. The record is the ResponseCard below. -->
				<Badge icon={responsePromiseIcon()}>
					Promises a reply within {job.responseSlaDays} days
				</Badge>
			{/if}
		</div>
	</header>

	<!-- Compensation gets its own panel rather than a line in the body copy. -->
	<Card>
		<div class="flex flex-wrap items-baseline justify-between gap-4">
			<div class="flex flex-col gap-1">
				<p class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Base salary</p>
				<p class="font-mono text-xl text-text tabular-nums" data-numeric>
					{formatSalaryRange(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod)}
				</p>
			</div>

			{#if job.equityRange}
				<div class="flex flex-col gap-1">
					<p class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Equity</p>
					<p class="font-mono text-xl text-text tabular-nums" data-numeric>{job.equityRange}</p>
				</div>
			{/if}

			<div class="flex items-center gap-2">
				<SaveJobButton {saved} busy={saving} ontoggle={signedIn ? toggleSave : null} />
				<Button variant="primary" size="lg" href="/jobs/{job.slug}/apply">Apply</Button>
			</div>
		</div>

		{#if job.market && job.marketSummary}
			<!--
				The comparison sits inside the pay panel, not in a section further down.
				Publishing a number is the product's first promise; saying whether the
				number is any good is the one people actually want, and it is worth
				nothing three screens below the figure it describes.
			-->
			<div class="mt-4 flex flex-col gap-3 border-t border-dashed border-border pt-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<p class="text-sm text-text-muted">{job.marketSummary}</p>
					<a
						href="/salaries/{job.market.benchmark.occupationSlug}"
						class="text-xs text-text-accent underline-offset-2 hover:underline"
					>
						{job.market.benchmark.occupationName} pay
					</a>
				</div>

				<PayComparison
					{...job.market.benchmark}
					marker={job.market.annualMidpoint}
					occupationName={job.market.benchmark.occupationName}
					sampleSize={job.market.benchmark.sampleSize}
				/>
			</div>
		{/if}
	</Card>

	<div class="flex flex-col gap-3">
		<div class="flex items-center gap-3 text-xs text-text-subtle">
			<time>Posted {formatRelativeTime(job.publishedAt)}</time>
			<span aria-hidden="true">·</span>
			<span>{job.applicantCount} applicant{job.applicantCount === 1 ? '' : 's'} so far</span>
			{#if job.screeningQuestionCount > 0}
				<span aria-hidden="true">·</span>
				<span>
					{job.screeningQuestionCount} screening question{job.screeningQuestionCount === 1
						? ''
						: 's'}
				</span>
			{/if}
		</div>

		<Markdown source={job.description} />
	</div>

	<!--
		The company's record, on the page where somebody decides whether to spend an
		evening on an application. Two clicks away is the same as absent.
	-->
	<ResponseCard stats={job.stats} summary={job.statsSummary} promisedDays={job.responseSlaDays} />

	{#if job.skills.length > 0}
		<div class="flex flex-col gap-2">
			<h2 class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Skills</h2>
			<div class="flex flex-wrap gap-2">
				{#each job.skills as skill (skill.name)}
					<Badge tone={skill.required ? 'accent' : 'neutral'}>{skill.name}</Badge>
				{/each}
			</div>
		</div>
	{/if}
</div>
