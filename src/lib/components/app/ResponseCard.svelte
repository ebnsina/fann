<script lang="ts">
	import Badge, { type BadgeTone } from '#lib/components/ui/Badge.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';

	type Stats = {
		responseRate: number | null;
		medianReplyDays: number | null;
		ghostedRate: number | null;
		confident: boolean;
	};

	type Props = {
		stats: Stats;
		/** The phrasing from the service. Required for `full`; unused by `compact`. */
		summary?: string;
		/** The days they promised, if any — shown against what they actually did. */
		promisedDays?: number | null;
		/** `compact` for a directory row; `full` for the company's own page. */
		variant?: 'compact' | 'full';
	};

	let { stats, summary = '', promisedDays = null, variant = 'full' }: Props = $props();

	/*
	 * The tone of the badge is the only judgement this component makes, and it is
	 * deliberately generous: anything above four in five is "replies", and only
	 * genuine silence is called out. A scale that renders 85% as a warning would
	 * make the whole feature read as a punishment scheme rather than information.
	 */
	const tone = $derived.by<BadgeTone>(() => {
		if (!stats.confident) return 'neutral';
		const rate = stats.responseRate ?? 0;
		if (rate >= 0.8) return 'success';
		if (rate >= 0.5) return 'warning';
		return 'danger';
	});

	const percent = $derived(
		stats.responseRate == null ? null : Math.round(stats.responseRate * 100)
	);

	const ghosted = $derived(stats.ghostedRate == null ? null : Math.round(stats.ghostedRate * 100));

	/** Whether they kept the promise they published. Only asked if they made one. */
	const keptPromise = $derived(
		promisedDays != null && stats.medianReplyDays != null
			? stats.medianReplyDays <= promisedDays
			: null
	);
</script>

{#if variant === 'compact'}
	<!--
		Exactly two flex children — the icon and one text span. A `gap` counts every
		bare text node as an item, so writing the sentence directly in here puts a
		1.5-unit gap in front of its punctuation.
	-->
	<span class="flex items-center gap-1.5 text-xs text-text-subtle">
		<Icon icon={percent != null ? icons.message : icons.time} class="size-3.5 shrink-0" />
		<span>
			{#if percent != null}
				Replies to <span class="text-text" data-numeric>{percent}%</span>
			{:else if promisedDays != null}
				<!--
					Deliberately not green. This is a promise nobody has checked yet, and
					colouring it as a success makes an unmeasured claim look earned — which
					is the exact habit the product exists to break.
				-->
				Promises <span data-numeric>{promisedDays}d</span>, not measured yet
			{:else}
				No record yet
			{/if}
		</span>
	</span>
{:else}
	<section class="flex flex-col gap-4 border border-border bg-surface p-(--fann-space-panel)">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="flex items-center gap-2 text-sm font-medium text-text">
				<Icon icon={icons.message} class="size-4 text-text-muted" />
				How they respond
			</h2>
			{#if percent != null}
				<Badge {tone}>
					<span data-numeric>{percent}%</span> answered
				</Badge>
			{/if}
		</div>

		<p class="text-sm text-text-muted">{summary}</p>

		{#if stats.confident}
			<dl class="grid gap-px border border-border bg-border sm:grid-cols-3">
				<div class="flex flex-col gap-1 bg-surface p-3">
					<dt class="text-2xs tracking-wide text-text-subtle uppercase">Answered</dt>
					<dd class="text-lg text-text" data-numeric>{percent}%</dd>
				</div>
				<div class="flex flex-col gap-1 bg-surface p-3">
					<dt class="text-2xs tracking-wide text-text-subtle uppercase">Typical reply</dt>
					<dd class="text-lg text-text" data-numeric>
						{stats.medianReplyDays == null
							? '—'
							: stats.medianReplyDays < 1
								? '<1d'
								: `${Math.round(stats.medianReplyDays)}d`}
					</dd>
				</div>
				<div class="flex flex-col gap-1 bg-surface p-3">
					<dt class="text-2xs tracking-wide text-text-subtle uppercase">Never heard back</dt>
					<dd class="text-lg text-text" data-numeric>{ghosted}%</dd>
				</div>
			</dl>
		{/if}

		{#if promisedDays != null}
			<p class="flex items-start gap-2 text-xs text-text-muted">
				<Icon
					icon={keptPromise === false ? icons.warning : icons.time}
					class="mt-0.5 size-3.5 shrink-0 {keptPromise === false
						? 'text-warning'
						: 'text-text-subtle'}"
				/>
				{#if keptPromise === null}
					They promise to reply within <span data-numeric>{promisedDays}</span> days. Not enough applications
					yet to say whether they do.
				{:else if keptPromise}
					<!--
						"The replies they send" rather than a bare "they keep to it": the median
						is measured over answered applications only, so a company that ignores
						most people would otherwise get a clean bill of health here.
					-->
					They promise <span data-numeric>{promisedDays}</span> days, and the replies they send arrive
					inside that.
				{:else}
					<!--
						Said plainly. The point of publishing a promise is that missing it is
						visible — softening this would make the promise decorative.
					-->
					They promise <span data-numeric>{promisedDays}</span> days. In practice it takes longer.
				{/if}
			</p>
		{/if}

		<p class="border-t border-dashed border-border pt-3 text-xs text-text-subtle">
			Measured from applications on Fann, not reported by the company. Applications from the last
			two weeks are not counted yet, and nothing is shown until there are at least five to go on.
		</p>
	</section>
{/if}
