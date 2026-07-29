<script lang="ts">
	import Badge, { type BadgeTone } from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import FormActions from '#lib/components/ui/FormActions.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime, formatSalaryRange, label } from '#lib/utils/format';

	type Period = 'hour' | 'day' | 'month' | 'year';

	type Offer = {
		id: string;
		salaryAmount: number;
		salaryCurrency: string;
		salaryPeriod: string;
		extras: string | null;
		startDate: Date | null;
		expiresAt: Date | null;
		status: string;
		sentAt: Date | null;
	};

	type Props = {
		offers: Offer[];
		canDraft: boolean;
		canSend: boolean;
		working?: boolean;
		ondraft: (input: {
			salaryAmount: number;
			salaryPeriod: Period;
			extras?: string;
			startDate?: string;
			expiresAt?: string;
		}) => void;
		onstatus: (offerId: string, status: 'sent' | 'accepted' | 'declined' | 'withdrawn') => void;
	};

	let { offers, canDraft, canSend, working = false, ondraft, onstatus }: Props = $props();

	const STATUS_TONE: Record<string, BadgeTone> = {
		draft: 'neutral',
		sent: 'info',
		accepted: 'success',
		declined: 'danger',
		withdrawn: 'neutral',
		expired: 'warning'
	};

	let drafting = $state(false);
	let amount = $state('');
	let period = $state<Period>('year');
	let extras = $state('');
	let startDate = $state('');
	let expiresAt = $state('');

	/** The offer waiting on a confirmation to be sent. */
	let sending = $state<Offer | null>(null);

	const PERIODS: { value: Period; label: string }[] = [
		{ value: 'year', label: 'Per year' },
		{ value: 'month', label: 'Per month' },
		{ value: 'day', label: 'Per day' },
		{ value: 'hour', label: 'Per hour' }
	];

	const parsedAmount = $derived(Number(amount.replace(/[^0-9]/g, '')));

	function submitDraft() {
		ondraft({
			salaryAmount: parsedAmount,
			salaryPeriod: period,
			extras: extras.trim() || undefined,
			// `<input type="date">` gives a bare day. Sent as an instant at UTC midnight
			// so the server never has to guess which zone the employer meant.
			startDate: startDate ? new Date(`${startDate}T00:00:00Z`).toISOString() : undefined,
			expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59Z`).toISOString() : undefined
		});
		drafting = false;
		amount = '';
		extras = '';
		startDate = '';
		expiresAt = '';
	}
</script>

<section class="flex flex-col border border-border bg-surface">
	<header class="flex items-center justify-between gap-2 border-b border-dashed border-border p-4">
		<h2 class="text-sm font-medium text-text">Offer</h2>
		{#if canDraft && offers.every( (offer) => ['declined', 'withdrawn', 'expired'].includes(offer.status) )}
			<Button size="sm" onclick={() => (drafting = true)}>
				<Icon icon={icons.add} class="size-3.5" />
				Draft
			</Button>
		{/if}
	</header>

	{#if offers.length === 0}
		<p class="p-4 text-xs text-text-subtle">
			No offer yet. Drafting one does not tell the candidate anything — sending it does.
		</p>
	{:else}
		<ul class="flex flex-col">
			{#each offers as offer (offer.id)}
				<li class="flex flex-col gap-3 border-b border-border p-4 last:border-b-0">
					<div class="flex items-center justify-between gap-2">
						<span class="text-base text-text" data-numeric>
							{formatSalaryRange(
								offer.salaryAmount,
								offer.salaryAmount,
								offer.salaryCurrency,
								offer.salaryPeriod
							)}
						</span>
						<Badge tone={STATUS_TONE[offer.status]}>{label(offer.status)}</Badge>
					</div>

					{#if offer.extras}
						<p class="text-sm text-text-muted">{offer.extras}</p>
					{/if}

					<dl class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-subtle">
						{#if offer.startDate}
							<div class="flex gap-1.5">
								<dt>Starts</dt>
								<dd data-numeric>{offer.startDate.toDateString()}</dd>
							</div>
						{/if}
						{#if offer.expiresAt}
							<div class="flex gap-1.5">
								<dt>Reply by</dt>
								<dd data-numeric>{offer.expiresAt.toDateString()}</dd>
							</div>
						{/if}
						{#if offer.sentAt}
							<div class="flex gap-1.5">
								<dt>Sent</dt>
								<dd>{formatRelativeTime(offer.sentAt)}</dd>
							</div>
						{/if}
					</dl>

					<div class="flex flex-wrap gap-2">
						{#if offer.status === 'draft' && canSend}
							<Button size="sm" variant="primary" onclick={() => (sending = offer)}>
								Send to candidate
							</Button>
						{/if}
						{#if offer.status === 'sent'}
							<!--
								Recorded by whoever heard the answer. The candidate accepting in
								the product is Phase 7 work; until then this is the honest shape —
								somebody types in what they were told.
							-->
							<Button size="sm" disabled={working} onclick={() => onstatus(offer.id, 'accepted')}>
								They accepted
							</Button>
							<Button size="sm" disabled={working} onclick={() => onstatus(offer.id, 'declined')}>
								They declined
							</Button>
						{/if}
						{#if ['draft', 'sent'].includes(offer.status) && canDraft}
							<Button
								size="sm"
								variant="ghost"
								disabled={working}
								onclick={() => onstatus(offer.id, 'withdrawn')}
							>
								Withdraw
							</Button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<Dialog
	bind:open={drafting}
	title="Draft an offer"
	description="Nothing is sent yet. You can look at it, change it, and send it when you are ready."
>
	<div class="flex flex-col gap-4">
		<Field label="Salary" hint="Numbers only. The candidate sees this exactly as written.">
			{#snippet children(control)}
				<Input {...control} bind:value={amount} inputmode="numeric" placeholder="145000" mono />
			{/snippet}
		</Field>

		<Field label="Per">
			{#snippet children(control)}
				<Select {...control} bind:value={period} items={PERIODS} />
			{/snippet}
		</Field>

		<Field label="Anything else" hint="Equity, bonus, signing. Optional.">
			{#snippet children(control)}
				<Textarea {...control} bind:value={extras} rows={2} />
			{/snippet}
		</Field>

		<div class="grid gap-4 sm:grid-cols-2">
			<Field label="Start date">
				{#snippet children(control)}
					<Input {...control} bind:value={startDate} type="date" />
				{/snippet}
			</Field>

			<Field label="Reply by" hint="A deadline nobody stated is not a deadline.">
				{#snippet children(control)}
					<Input {...control} bind:value={expiresAt} type="date" />
				{/snippet}
			</Field>
		</div>
	</div>

	{#snippet footer()}
		<FormActions>
			{#snippet aside()}
				<Button variant="secondary" onclick={() => (drafting = false)}>Cancel</Button>
			{/snippet}
			<Button variant="primary" loading={working} disabled={!parsedAmount} onclick={submitDraft}>
				Save draft
			</Button>
		</FormActions>
	{/snippet}
</Dialog>

<ConfirmDialog
	open={sending !== null}
	title="Send this offer?"
	description="The candidate is emailed the salary, the start date and the deadline, exactly as written."
	detail="This is the number they will hold you to. Check it before it leaves."
	confirmLabel="Send offer"
	tone="primary"
	loading={working}
	onconfirm={() => {
		if (sending) onstatus(sending.id, 'sent');
		sending = null;
	}}
	oncancel={() => (sending = null)}
/>
