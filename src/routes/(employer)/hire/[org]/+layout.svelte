<script lang="ts">
	import { page } from '$app/state';
	import AppShell from '#lib/components/app/AppShell.svelte';
	import type { CommandAction } from '#lib/components/app/CommandPalette.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';
	import { listJobs } from './jobs.remote';

	let { children } = $props();

	const orgSlug = $derived(page.params.org ?? '');
	const jobs = $derived(await listJobs(orgSlug));

	const openJobs = $derived(jobs.filter((job) => job.status === 'published').length);
	const drafts = $derived(jobs.filter((job) => job.status === 'draft').length);

	const sections = $derived([
		{
			items: [
				{ label: 'Jobs', href: `/hire/${orgSlug}/jobs`, icon: icons.jobs, badge: openJobs },
				{ label: 'Candidates', href: `/hire/${orgSlug}/candidates`, icon: icons.candidates },
				{ label: 'Reports', href: `/hire/${orgSlug}/reports`, icon: icons.analytics }
			]
		},
		{
			label: 'Organization',
			items: [
				// Only routes that exist. Interviews, the company profile and settings are
				// not built yet, and a nav link to a 404 is worse than a missing link.
				{ label: 'Team', href: `/hire/${orgSlug}/team`, icon: icons.candidates },
				{ label: 'Company', href: `/hire/${orgSlug}/company`, icon: icons.companies },
				{ label: 'Billing', href: `/hire/${orgSlug}/billing`, icon: icons.price }
			]
		}
	]);

	const commands = $derived<CommandAction[]>([
		{
			id: 'new-job',
			label: 'Post a new job',
			group: 'Actions',
			href: `/hire/${orgSlug}/jobs/new`
		},
		{ id: 'jobs', label: 'Go to jobs', group: 'Navigate', href: `/hire/${orgSlug}/jobs` },
		{ id: 'board', label: 'View the public job board', group: 'Navigate', href: '/jobs' },
		...jobs.slice(0, 20).map((job) => ({
			id: job.id,
			label: job.title,
			group: 'Your jobs',
			keywords: job.status,
			href: `/hire/${orgSlug}/jobs/${job.id}`
		}))
	]);

	const title = $derived(
		page.url.pathname.endsWith('/jobs')
			? `Jobs${drafts > 0 ? ` · ${drafts} draft${drafts === 1 ? '' : 's'}` : ''}`
			: 'Hiring'
	);
</script>

<AppShell {sections} {commands} {title}>
	{#snippet brand()}
		<a href="/hire" class="flex items-center gap-2 text-sm font-semibold tracking-tight text-text">
			<Icon icon={icons.companies} class="text-text-muted" />
			<span class="truncate">{orgSlug}</span>
		</a>
	{/snippet}

	{#snippet actions()}
		<Button href="/hire/{orgSlug}/jobs/new" variant="primary" size="sm">
			<Icon icon={icons.add} class="size-3.5" />
			Post a job
		</Button>
	{/snippet}

	{@render children()}
</AppShell>
