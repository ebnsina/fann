<script lang="ts">
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime } from '#lib/utils/format';
	import { cn } from '#lib/utils/cn';

	type Criterion = { id: string; name: string; description: string | null };
	type Rating = { criterionId: string; rating: number; comment: string | null };
	type Scorecard = {
		id: string;
		interviewer: { id: string; name: string };
		overall: number | null;
		summary: string | null;
		submittedAt: Date | null;
		ratings: Rating[];
	};

	type Props = {
		criteria: Criterion[];
		mine: Scorecard | null;
		others: Scorecard[];
		othersSubmittedCount: number;
		hiddenUntilYouSubmit: boolean;
		canScore: boolean;
		working?: boolean;
		onsave: (input: {
			overall?: number;
			summary?: string;
			ratings: { criterionId: string; rating: number; comment?: string }[];
			submit?: boolean;
		}) => void;
	};

	let {
		criteria,
		mine,
		others,
		othersSubmittedCount,
		hiddenUntilYouSubmit,
		canScore,
		working = false,
		onsave
	}: Props = $props();

	/**
	 * The scale, 1–4 with no middle.
	 *
	 * An odd scale lets a panel park on the centre and never decide, which produces
	 * a page full of threes and no information. Four forces a lean.
	 */
	const SCALE = [
		{ value: 1, label: 'No' },
		{ value: 2, label: 'Leaning no' },
		{ value: 3, label: 'Leaning yes' },
		{ value: 4, label: 'Yes' }
	];

	const submitted = $derived(Boolean(mine?.submittedAt));

	// Seeded from the saved draft, then owned by the form. `$state` rather than
	// `$derived` because the user types into it.
	let overall = $state<number | null>(null);
	let summary = $state('');
	let ratings = $state<Record<string, number>>({});

	// Adopt whatever is already saved, once, when it arrives.
	let seeded = $state(false);
	$effect(() => {
		if (seeded || !mine) return;
		seeded = true;
		overall = mine.overall;
		summary = mine.summary ?? '';
		ratings = Object.fromEntries(mine.ratings.map((rating) => [rating.criterionId, rating.rating]));
	});

	let confirming = $state(false);

	function collect(submit: boolean) {
		return {
			overall: overall ?? undefined,
			summary: summary.trim() || undefined,
			ratings: Object.entries(ratings).map(([criterionId, rating]) => ({ criterionId, rating })),
			submit
		};
	}

	function nameFor(criterionId: string): string {
		return criteria.find((criterion) => criterion.id === criterionId)?.name ?? 'Criterion';
	}
</script>

<section class="flex flex-col border border-border bg-surface">
	<header class="flex flex-col gap-1 border-b border-dashed border-border p-4">
		<div class="flex items-center justify-between gap-2">
			<h2 class="text-sm font-medium text-text">Interview scores</h2>
			{#if othersSubmittedCount > 0}
				<span class="text-xs text-text-subtle">
					<span data-numeric>{othersSubmittedCount}</span>
					other{othersSubmittedCount === 1 ? '' : 's'} scored
				</span>
			{/if}
		</div>
		<!--
			The rule, said on the page. An interviewer who does not know why the panel
			is hidden assumes the page is broken and asks a colleague — which is the
			leak the rule exists to prevent.
		-->
		<p class="text-xs text-text-subtle">
			You will see everyone else's once you submit your own. Nobody sees yours before then.
		</p>
	</header>

	{#if canScore && !submitted}
		<div class="flex flex-col gap-5 border-b border-dashed border-border p-4">
			{#each criteria as criterion (criterion.id)}
				<fieldset class="flex flex-col gap-2">
					<legend class="text-xs font-medium text-text">{criterion.name}</legend>
					{#if criterion.description}
						<p class="text-2xs text-text-subtle">{criterion.description}</p>
					{/if}

					<div class="flex flex-wrap gap-1.5">
						{#each SCALE as step (step.value)}
							<button
								type="button"
								aria-pressed={ratings[criterion.id] === step.value}
								class={cn(
									'border px-2.5 py-1 text-xs transition-colors',
									ratings[criterion.id] === step.value
										? 'border-border-accent bg-accent-subtle text-text-accent'
										: 'border-border text-text-muted hover:border-border-strong hover:text-text'
								)}
								onclick={() => (ratings[criterion.id] = step.value)}
							>
								{step.value} · {step.label}
							</button>
						{/each}
					</div>
				</fieldset>
			{/each}

			<fieldset class="flex flex-col gap-2 border-t border-dashed border-border pt-4">
				<legend class="text-xs font-medium text-text">Overall</legend>
				<div class="flex flex-wrap gap-1.5">
					{#each SCALE as step (step.value)}
						<button
							type="button"
							aria-pressed={overall === step.value}
							class={cn(
								'border px-2.5 py-1 text-xs transition-colors',
								overall === step.value
									? 'border-border-accent bg-accent-subtle text-text-accent'
									: 'border-border text-text-muted hover:border-border-strong hover:text-text'
							)}
							onclick={() => (overall = step.value)}
						>
							{step.value} · {step.label}
						</button>
					{/each}
				</div>
			</fieldset>

			<Textarea
				bind:value={summary}
				rows={3}
				placeholder="What would you want the next interviewer to know?"
				aria-label="Summary"
			/>

			<div class="flex flex-wrap items-center justify-end gap-2">
				<Button size="sm" variant="ghost" loading={working} onclick={() => onsave(collect(false))}>
					Save draft
				</Button>
				<Button
					size="sm"
					variant="primary"
					disabled={overall === null}
					onclick={() => (confirming = true)}
				>
					Submit
				</Button>
			</div>
		</div>
	{/if}

	{#if submitted && mine}
		<div class="flex flex-col gap-2 border-b border-dashed border-border p-4">
			<div class="flex items-center justify-between gap-2">
				<span class="text-xs font-medium text-text">Yours</span>
				<Badge tone="success" icon={icons.check}>
					<span data-numeric>{mine.overall}</span>/4
				</Badge>
			</div>
			{#if mine.summary}
				<p class="text-sm whitespace-pre-wrap text-text-muted">{mine.summary}</p>
			{/if}
			{#each mine.ratings as rating (rating.criterionId)}
				<p class="text-xs text-text-subtle">
					{nameFor(rating.criterionId)}: <span data-numeric>{rating.rating}</span>/4
				</p>
			{/each}
		</div>
	{/if}

	{#if hiddenUntilYouSubmit}
		<p class="flex items-start gap-2.5 p-4 text-xs text-text-muted">
			<Icon icon={icons.privacy} class="mt-0.5 size-3.5 shrink-0 text-text-subtle" />
			{othersSubmittedCount}
			{othersSubmittedCount === 1 ? 'colleague has' : 'colleagues have'} scored this candidate. Their
			scores stay hidden until you submit yours — reading them first would make your assessment an agreement
			rather than an assessment.
		</p>
	{:else if others.length > 0}
		<ul class="flex flex-col">
			{#each others as card (card.id)}
				<li class="flex flex-col gap-2 border-b border-border p-4 last:border-b-0">
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs font-medium text-text">{card.interviewer.name}</span>
						<Badge tone={card.overall && card.overall >= 3 ? 'success' : 'neutral'}>
							<span data-numeric>{card.overall}</span>/4
						</Badge>
					</div>
					{#if card.summary}
						<p class="text-sm whitespace-pre-wrap text-text-muted">{card.summary}</p>
					{/if}
					{#if card.submittedAt}
						<time class="text-2xs text-text-subtle" datetime={card.submittedAt.toISOString()}>
							{formatRelativeTime(card.submittedAt)}
						</time>
					{/if}
				</li>
			{/each}
		</ul>
	{:else if !canScore}
		<p class="p-4 text-xs text-text-subtle">No scores submitted yet.</p>
	{/if}
</section>

<ConfirmDialog
	bind:open={confirming}
	title="Submit this scorecard?"
	description="It becomes visible to the rest of the panel, and you will be able to see theirs."
	detail="You cannot change it afterwards. That is the point — a score revised after reading the room is the anchoring this is meant to prevent."
	confirmLabel="Submit"
	tone="primary"
	loading={working}
	onconfirm={() => {
		confirming = false;
		onsave(collect(true));
	}}
/>
