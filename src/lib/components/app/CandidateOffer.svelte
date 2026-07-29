<script lang="ts">
	import Badge, { type BadgeTone } from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';
	import { formatSalaryRange, label } from '#lib/utils/format';

	/** Only what is drawn. The id stays with the caller, which owns the decision. */
	type Offer = {
		salaryAmount: number;
		salaryCurrency: string;
		salaryPeriod: string;
		extras: string | null;
		startDate: Date | null;
		expiresAt: Date | null;
		status: string;
		decidedAt: Date | null;
		/** Whether the deadline has passed, decided by the database's clock. */
		lapsed: boolean;
	};

	type Props = {
		offer: Offer;
		jobTitle: string;
		companyName: string;
		busy?: boolean;
		onrespond: (decision: 'accepted' | 'declined') => void;
	};

	let { offer, jobTitle, companyName, busy = false, onrespond }: Props = $props();

	let confirming = $state<'accepted' | 'declined' | null>(null);

	/**
	 * Whether there is still a decision to make.
	 *
	 * `lapsed` is checked as well as the status because `expireOverdue` runs on a
	 * schedule: between the deadline passing and the job running, the row still says
	 * `sent`. Offering buttons the server would refuse is worse than showing none.
	 */
	const decidable = $derived(offer.status === 'sent' && !offer.lapsed);

	const STATUS_TONE: Record<string, BadgeTone> = {
		sent: 'accent',
		accepted: 'success',
		declined: 'neutral',
		withdrawn: 'neutral',
		expired: 'neutral'
	};

	const pay = $derived(
		formatSalaryRange(
			offer.salaryAmount,
			offer.salaryAmount,
			offer.salaryCurrency,
			offer.salaryPeriod
		)
	);

	// Explicit components: `Intl.DateTimeFormat` throws if `dateStyle` is combined
	// with any individual field, and this needs the year spelled out.
	const date = new Intl.DateTimeFormat(undefined, {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
</script>

<!--
	Accented rather than neutral: this is the one row on the page that is waiting on
	the person reading it, and an offer that looks like every other status line gets
	scrolled past.
-->
<section
	class="flex flex-col gap-4 border {decidable
		? 'border-accent bg-accent-subtle'
		: 'border-border bg-surface-raised'} p-(--fann-space-panel)"
>
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="flex items-center gap-2">
			<Icon icon={icons.offer} class="size-4 text-text-muted" />
			<h3 class="text-sm font-medium text-text">
				{decidable ? 'You have an offer' : 'Offer'}
			</h3>
		</div>
		<Badge tone={STATUS_TONE[offer.status] ?? 'neutral'}>
			{offer.lapsed && offer.status === 'sent' ? 'Expired' : label(offer.status)}
		</Badge>
	</div>

	<!--
		The number leads, and it is never absent — an offer without one is refused at
		the service. This is the last point where the product's argument could quietly
		be dropped, and it is where it would cost the most.
	-->
	<div class="flex flex-col gap-1">
		<p class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Salary</p>
		<p class="text-2xl text-text" data-numeric>{pay}</p>
	</div>

	{#if offer.extras}
		<div class="flex flex-col gap-1">
			<p class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Also included</p>
			<p class="text-sm text-text-muted">{offer.extras}</p>
		</div>
	{/if}

	<dl class="flex flex-wrap gap-x-8 gap-y-2 text-xs">
		{#if offer.startDate}
			<div class="flex items-center gap-1.5">
				<dt class="text-text-subtle">Starting</dt>
				<dd class="text-text" data-numeric>{date.format(offer.startDate)}</dd>
			</div>
		{/if}
		{#if offer.expiresAt}
			<div class="flex items-center gap-1.5">
				<dt class="text-text-subtle">{offer.lapsed ? 'Expired' : 'Reply by'}</dt>
				<dd class="text-text" data-numeric>{date.format(offer.expiresAt)}</dd>
			</div>
		{/if}
		{#if offer.decidedAt}
			<div class="flex items-center gap-1.5">
				<dt class="text-text-subtle">Answered</dt>
				<dd class="text-text" data-numeric>{date.format(offer.decidedAt)}</dd>
			</div>
		{/if}
	</dl>

	{#if decidable}
		<!--
			Decline sits on the left as the secondary action and accept keeps the
			corner, the same arrangement as every form in the product. Neither is
			pre-selected — this is not a dialog to dismiss.
		-->
		<div
			class="flex flex-wrap items-center justify-end gap-2 border-t border-dashed border-border pt-4"
		>
			<Button size="sm" variant="ghost" disabled={busy} onclick={() => (confirming = 'declined')}>
				Decline
			</Button>
			<Button size="sm" variant="primary" loading={busy} onclick={() => (confirming = 'accepted')}>
				Accept offer
			</Button>
		</div>
	{/if}
</section>

<ConfirmDialog
	open={confirming === 'accepted'}
	tone="primary"
	title="Accept this offer?"
	description="You are accepting the {jobTitle} role at {companyName} for {pay}."
	detail="We will tell {companyName} straight away, and this cannot be undone here. Anything still to agree is between you and them."
	confirmLabel="Accept offer"
	loading={busy}
	onconfirm={() => {
		confirming = null;
		onrespond('accepted');
	}}
	oncancel={() => (confirming = null)}
/>

<ConfirmDialog
	open={confirming === 'declined'}
	title="Decline this offer?"
	description="You are turning down the {jobTitle} role at {companyName}."
	detail="We will tell {companyName}. They cannot re-open this offer, though nothing stops them making you another one."
	confirmLabel="Decline offer"
	loading={busy}
	onconfirm={() => {
		confirming = null;
		onrespond('declined');
	}}
	oncancel={() => (confirming = null)}
/>
