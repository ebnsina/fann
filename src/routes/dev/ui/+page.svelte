<script lang="ts">
	import { icons } from '#lib/design/icons';
	import { formatCompactCurrency } from '#lib/utils/format';
	import Icon from '#lib/components/ui/Icon.svelte';
	import AppShell from '#lib/components/app/AppShell.svelte';
	import type { CommandAction } from '#lib/components/app/CommandPalette.svelte';
	import {
		Avatar,
		Badge,
		Button,
		Card,
		Checkbox,
		Dialog,
		EmptyState,
		Field,
		Input,
		Kbd,
		Select,
		Skeleton,
		Spinner,
		Switch,
		Table,
		Tabs,
		Td,
		Textarea,
		Th,
		toast,
		Tooltip,
		type BadgeTone,
		type ButtonVariant
	} from '#lib/components/ui';

	const sections = [
		{
			items: [
				{ label: 'Jobs', href: '/dev/ui', icon: icons.jobs, badge: 12 },
				{ label: 'Candidates', href: '/dev/ui/candidates', icon: icons.candidates, badge: 148 },
				{ label: 'Companies', href: '/dev/ui/companies', icon: icons.companies }
			]
		},
		{
			label: 'Pipeline',
			items: [{ label: 'Inbox', href: '/dev/ui/inbox', icon: icons.inbox, badge: 3 }]
		}
	];

	const commands: CommandAction[] = [
		{ id: 'new-job', label: 'Post a new job', group: 'Actions', shortcut: 'N' },
		{ id: 'invite', label: 'Invite a teammate', group: 'Actions' },
		{ id: 'jobs', label: 'Go to jobs', group: 'Navigate', href: '/dev/ui' },
		{
			id: 'candidates',
			label: 'Go to candidates',
			group: 'Navigate',
			keywords: 'people applicants'
		}
	];

	const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger', 'link'];
	const TONES: BadgeTone[] = ['neutral', 'accent', 'success', 'warning', 'danger', 'info'];

	const ROWS = [
		{
			title: 'Senior Backend Engineer',
			company: 'Acme',
			comp: 200000,
			applicants: 48,
			stage: 'Screening'
		},
		{
			title: 'Product Designer',
			company: 'Beta Works',
			comp: 165000,
			applicants: 12,
			stage: 'Applied'
		},
		{
			title: 'Engineering Manager',
			company: 'Gamma Labs',
			comp: 240000,
			applicants: 7,
			stage: 'Onsite'
		}
	];

	let sort = $state<'asc' | 'desc' | null>('desc');
	let checked = $state(true);
	let indeterminate = $state(false);
	let enabled = $state(true);
	let selected = $state('remote');
	let dialogOpen = $state(false);
	let text = $state('');
	let loading = $state(false);

	const issues = $derived(
		text.length > 0 && text.length < 5 ? [{ message: 'Too short.' }] : undefined
	);
</script>

<svelte:head><title>UI · Fann</title></svelte:head>

<AppShell {sections} {commands} title="Design system">
	{#snippet brand()}
		<span class="text-sm font-semibold tracking-tight text-text">Fann</span>
	{/snippet}

	{#snippet actions()}
		<Button variant="primary" size="sm">Post a job</Button>
	{/snippet}

	<div class="flex flex-col gap-12 p-(--fann-space-page)">
		<!-- Typography ------------------------------------------------------- -->
		<section class="flex flex-col gap-4">
			<h2 class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Type scale</h2>
			<Card>
				<div class="flex flex-col gap-2">
					<p class="text-3xl">Hire without the guesswork</p>
					<p class="text-2xl">Hire without the guesswork</p>
					<p class="text-xl">Hire without the guesswork</p>
					<p class="text-lg">Hire without the guesswork</p>
					<p class="text-base">Hire without the guesswork</p>
					<p class="text-sm">Body — 13px, the default across the product</p>
					<p class="text-xs text-text-muted">Secondary — 12px</p>
					<p class="text-2xs tracking-wide text-text-subtle uppercase">Label — 11px</p>
					<p class="font-mono text-sm tabular-nums">$160,000 – $200,000 · 2026-07-28 · #A83F91</p>
				</div>
			</Card>
		</section>

		<!-- Buttons ---------------------------------------------------------- -->
		<section class="flex flex-col gap-4">
			<h2 class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Buttons</h2>
			<Card>
				<div class="flex flex-col gap-4">
					<div class="flex flex-wrap items-center gap-2">
						{#each VARIANTS as variant (variant)}
							<Button {variant}>{variant}</Button>
						{/each}
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<Button size="xs">xs</Button>
						<Button size="sm">sm</Button>
						<Button size="md">md</Button>
						<Button size="lg">lg</Button>
						<Button variant="primary" disabled>disabled</Button>
						<Button variant="primary" {loading} onclick={() => (loading = !loading)}>
							Toggle loading
						</Button>
					</div>
				</div>
			</Card>
		</section>

		<!-- Form controls ---------------------------------------------------- -->
		<section class="flex flex-col gap-4">
			<h2 class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Form controls</h2>
			<Card>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field label="Job title" required hint="Shown on the public listing.">
						{#snippet children(control)}
							<Input {...control} placeholder="Senior Backend Engineer" />
						{/snippet}
					</Field>

					<Field label="Base salary" required hint="Ranges are mandatory on every listing.">
						{#snippet children(control)}
							<Input {...control} mono placeholder="160000" inputmode="numeric" />
						{/snippet}
					</Field>

					<Field label="Summary" {issues} hint="At least five characters.">
						{#snippet children(control)}
							<Textarea
								{...control}
								bind:value={text}
								autoresize
								placeholder="What the role involves…"
							/>
						{/snippet}
					</Field>

					<Field label="Work mode">
						{#snippet children(control)}
							<Select
								{...control}
								bind:value={selected}
								items={[
									{ value: 'remote', label: 'Remote' },
									{ value: 'hybrid', label: 'Hybrid' },
									{ value: 'onsite', label: 'On-site' },
									{ value: 'unknown', label: 'Not specified', disabled: true }
								]}
							/>
						{/snippet}
					</Field>

					<div class="flex flex-col gap-3">
						<Checkbox bind:checked label="Accepting applications" />
						<Checkbox bind:indeterminate checked={false} label="Select all candidates" />
						<Switch bind:checked={enabled} label="Publish immediately" />
					</div>

					<div class="flex flex-col items-start gap-3">
						<Input size="sm" placeholder="Small" />
						<Input size="md" placeholder="Medium" />
						<Input size="lg" placeholder="Large" />
						<Input placeholder="Invalid" aria-invalid="true" />
						<Input placeholder="Disabled" disabled />
					</div>
				</div>
			</Card>
		</section>

		<!-- Data display ----------------------------------------------------- -->
		<section class="flex flex-col gap-4">
			<h2 class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Data display</h2>
			<Card>
				<div class="flex flex-col gap-4">
					<div class="flex flex-wrap items-center gap-2">
						{#each TONES as tone (tone)}
							<Badge {tone} dot>{tone}</Badge>
						{/each}
					</div>

					<div class="flex flex-wrap items-center gap-3">
						<Avatar name="Ada Lovelace" size="xs" />
						<Avatar name="Ada Lovelace" size="sm" />
						<Avatar name="Grace Hopper" size="md" />
						<Avatar name="Alan Turing" size="lg" />
						<Spinner size="md" />
						<Kbd>⌘K</Kbd>
						<Kbd>Esc</Kbd>
					</div>

					<Table label="Open roles" stickyHeader>
						{#snippet head()}
							<tr>
								<Th>Role</Th>
								<Th>Company</Th>
								<Th align="right" {sort} onsort={() => (sort = sort === 'asc' ? 'desc' : 'asc')}>
									Base
								</Th>
								<Th align="right">Applicants</Th>
								<Th>Stage</Th>
							</tr>
						{/snippet}

						{#each ROWS as row (row.title)}
							<tr class="transition-colors hover:bg-surface-hover">
								<Td class="font-medium">{row.title}</Td>
								<Td class="text-text-muted">{row.company}</Td>
								<Td align="right" mono>{formatCompactCurrency(row.comp)}</Td>
								<Td align="right" mono>{row.applicants}</Td>
								<Td><Badge dot>{row.stage}</Badge></Td>
							</tr>
						{/each}
					</Table>

					<div class="flex flex-col gap-2">
						<Skeleton height="2.25rem" />
						<Skeleton height="2.25rem" width="70%" />
					</div>
				</div>
			</Card>
		</section>

		<!-- Composition ------------------------------------------------------ -->
		<section class="flex flex-col gap-4">
			<h2 class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Composition</h2>

			<Tabs
				items={[
					{ value: 'empty', label: 'Empty state' },
					{ value: 'overlays', label: 'Overlays', count: 3 }
				]}
			>
				{#snippet children(value)}
					{#if value === 'empty'}
						<EmptyState
							title="No candidates yet"
							description="Once someone applies they will show up here, newest first."
						>
							{#snippet icon()}<Icon icon={icons.candidates} class="size-6" />{/snippet}
							{#snippet action()}<Button variant="primary" size="sm">Share this job</Button
								>{/snippet}
						</EmptyState>
					{:else}
						<div class="flex flex-wrap items-center gap-2">
							<Button onclick={() => (dialogOpen = true)}>Open dialog</Button>

							<Tooltip content="Move to the next stage" shortcut="⌘↵">
								{#snippet children({ props })}
									<Button {...props}>Hover me</Button>
								{/snippet}
							</Tooltip>

							<Button onclick={() => toast.success('Candidate moved to Onsite')}>
								Success toast
							</Button>
							<Button
								onclick={() =>
									toast.error('Could not send the offer', {
										description: 'The mail provider rejected the message.',
										action: { label: 'Retry', onclick: () => toast.info('Retrying…') }
									})}
							>
								Error toast
							</Button>
						</div>
					{/if}
				{/snippet}
			</Tabs>
		</section>
	</div>
</AppShell>

<Dialog
	bind:open={dialogOpen}
	title="Reject candidate"
	description="They will be notified by email. This cannot be undone."
>
	<Field label="Reason">
		{#snippet children(control)}
			<Textarea {...control} placeholder="Optional note for your team…" />
		{/snippet}
	</Field>

	{#snippet footer()}
		<Button onclick={() => (dialogOpen = false)}>Cancel</Button>
		<Button variant="danger" onclick={() => (dialogOpen = false)}>Reject</Button>
	{/snippet}
</Dialog>
