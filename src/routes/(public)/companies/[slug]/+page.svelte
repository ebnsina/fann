<script lang="ts">
	import { page } from '$app/state';
	import PostCard from '#lib/components/app/PostCard.svelte';
	import VerifiedMark from '#lib/components/app/VerifiedMark.svelte';
	import ResponseCard from '#lib/components/app/ResponseCard.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Markdown from '#lib/components/ui/Markdown.svelte';
	import { icons } from '#lib/design/icons';
	import { employmentTypeIcon, responsePromiseIcon, workModeIcon } from '#lib/design/job-icons';
	import { formatSalaryRange, label } from '#lib/utils/format';
	import { getCompany } from './company.remote';
	import { currentUser } from '../../../(auth)/auth.remote';
	import { following, toggleFollow } from '../../feed/feed.remote';
	import { toast } from '#lib/components/ui/toast.svelte';

	const slug = $derived(page.params.slug ?? '');
	const data = $derived(await getCompany(slug));
	const company = $derived(data.company);

	const viewer = $derived(await currentUser());
	const isFollowing = $derived(await following({ companyId: company.id }));

	let followBusy = $state(false);

	async function follow() {
		followBusy = true;
		try {
			const result = await toggleFollow({ companyId: company.id });
			toast.success(result.following ? `Following ${company.name}.` : 'Unfollowed.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not do that.');
		} finally {
			followBusy = false;
		}
	}

	/** The slowest promise across their live roles, so the figure is not flattering. */
	const promisedDays = $derived(
		data.jobs.reduce<number | null>(
			(slowest, job) =>
				job.responseSlaDays == null
					? slowest
					: slowest == null
						? job.responseSlaDays
						: Math.max(slowest, job.responseSlaDays),
			null
		)
	);
</script>

<svelte:head>
	<title>{company.name} · Fann</title>
	<meta
		name="description"
		content="{company.name} on Fann — {data.jobs
			.length} open roles, every one showing its pay, and a measured record of how they reply."
	/>
</svelte:head>

<div class="mx-auto flex max-w-(--fann-shell-width) flex-col gap-8 px-(--fann-space-page) py-12">
	<!-- Header --------------------------------------------------------------- -->
	<div class="flex flex-col gap-3">
		<a
			href="/companies"
			class="flex w-fit items-center gap-1.5 text-xs text-text-muted hover:text-text"
		>
			<Icon icon={icons.chevronLeft} class="size-3" />
			All companies
		</a>

		<div class="flex flex-wrap items-start justify-between gap-4">
			<div class="flex flex-col gap-2">
				<h1 class="flex items-center gap-2 text-3xl text-text">
					{#if company.domainVerifiedAt}
						<VerifiedMark size="md" />
					{/if}
					{company.name}
				</h1>
				{#if company.tagline}
					<p class="max-w-2xl text-base text-text-muted">{company.tagline}</p>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-3">
				{#if viewer}
					<Button variant={isFollowing ? 'ghost' : 'primary'} loading={followBusy} onclick={follow}>
						{isFollowing ? 'Following' : 'Follow'}
					</Button>
				{:else}
					<!-- A link, not a disabled button: following needs an account, and the
					     useful response to that is to offer one. -->
					<Button href="/login" variant="ghost">Follow</Button>
				{/if}

				{#if data.followers > 0}
					<span class="text-xs text-text-subtle">
						<span data-numeric>{data.followers}</span>
						{data.followers === 1 ? 'follower' : 'followers'}
					</span>
				{/if}
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-4 text-sm text-text-muted">
			{#if company.size}
				<span class="flex items-center gap-1.5">
					<Icon icon={icons.candidates} class="size-3.5" />
					{company.size} people
				</span>
			{/if}
			{#if company.foundedYear}
				<span class="flex items-center gap-1.5">
					<Icon icon={icons.time} class="size-3.5" />
					Since <span data-numeric>{company.foundedYear}</span>
				</span>
			{/if}
			{#if company.websiteUrl}
				<a
					href={company.websiteUrl}
					target="_blank"
					rel="noopener nofollow"
					class="flex items-center gap-1.5 text-text-accent underline-offset-2 hover:underline"
				>
					<Icon icon={icons.externalLink} class="size-3.5" />
					Website
				</a>
			{/if}
		</div>
	</div>

	<!-- The report card ------------------------------------------------------- -->
	<ResponseCard stats={data.stats} summary={data.summary} {promisedDays} />

	{#if company.about}
		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-medium text-text">About</h2>
			<!-- Written by the company, so it goes through the sanitizer like every
			     other piece of user-supplied markdown. -->
			<Markdown source={company.about} />
		</section>
	{/if}

	{#if data.posts.length > 0}
		<section class="flex flex-col gap-4">
			<h2 class="text-sm font-medium text-text">Updates</h2>
			<div class="flex flex-col gap-px border border-border bg-border">
				{#each data.posts as post (post.id)}
					<div class="fann-enter">
						<PostCard {post} signedIn={Boolean(viewer)} viewerName={viewer?.name ?? 'You'} />
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Open roles ------------------------------------------------------------ -->
	<section class="flex flex-col gap-4">
		<h2 class="text-sm font-medium text-text">
			{data.jobs.length}
			open {data.jobs.length === 1 ? 'role' : 'roles'}
		</h2>

		{#if data.jobs.length === 0}
			<EmptyState
				title="Nothing open right now"
				description="They are not hiring on Fann at the moment."
			>
				{#snippet icon()}<Icon icon={icons.jobs} class="size-6" />{/snippet}
				{#snippet action()}
					<Button href="/jobs" size="sm">
						Browse every job
						<Icon icon={icons.arrowRight} class="size-3.5" />
					</Button>
				{/snippet}
			</EmptyState>
		{:else}
			<div class="grid gap-px border border-border bg-border">
				{#each data.jobs as job (job.slug)}
					<a
						href="/jobs/{job.slug}"
						class="group flex flex-col gap-3 bg-surface p-(--fann-space-panel) transition-colors hover:bg-surface-hover"
					>
						<div class="flex flex-wrap items-start justify-between gap-4">
							<h3 class="text-base font-medium text-text group-hover:text-text-accent">
								{job.title}
							</h3>
							<p class="shrink-0 text-sm text-text" data-numeric>
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
								<!-- Neutral, and directly beneath the card that says whether they
								     keep it — a green badge there would argue with the figures. -->
								<Badge icon={responsePromiseIcon()}>
									Promises {job.responseSlaDays}d
								</Badge>
							{/if}
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</section>
</div>
