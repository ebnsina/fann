<script lang="ts">
	import Badge from '#lib/components/ui/Badge.svelte';
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
	import { formatRelativeTime } from '#lib/utils/format';

	/** Matches the `interview_mode` enum. Widening it to `string` here is what made
	    the page reach for a cast at the call site. */
	type Mode = 'video' | 'phone' | 'onsite';

	type Interview = {
		id: string;
		title: string;
		mode: Mode;
		location: string | null;
		startsAt: Date;
		durationMinutes: number;
		notes: string | null;
		cancelledAt: Date | null;
		participants: { id: string; name: string }[];
	};

	type Props = {
		interviews: Interview[];
		calendarHref: (interviewId: string) => string;
		canSchedule: boolean;
		working?: boolean;
		onschedule: (input: {
			title: string;
			mode: Mode;
			location?: string;
			startsAt: string;
			durationMinutes: number;
			notes?: string;
		}) => void;
		oncancel: (interviewId: string) => void;
	};

	let {
		interviews,
		calendarHref,
		canSchedule,
		working = false,
		onschedule,
		oncancel
	}: Props = $props();

	const MODES: { value: Mode; label: string }[] = [
		{ value: 'video', label: 'Video call' },
		{ value: 'phone', label: 'Phone' },
		{ value: 'onsite', label: 'In person' }
	];

	const MODE_ICON: Record<Mode, (typeof icons)[keyof typeof icons]> = {
		video: icons.workRemote,
		phone: icons.message,
		onsite: icons.workOnsite
	};

	let scheduling = $state(false);
	let title = $state('First conversation');
	let mode = $state<Mode>('video');
	let location = $state('');
	let localTime = $state('');
	let duration = $state('45');
	let notes = $state('');

	let cancelling = $state<Interview | null>(null);

	/**
	 * A datetime that can be read on both sides.
	 *
	 * `<input type="datetime-local">` gives a wall clock with no zone. It is
	 * interpreted here in the *employer's* browser zone and sent as an instant, so
	 * the candidate three time zones away and the calendar file both agree with
	 * what was on screen when it was booked.
	 */
	const instant = $derived(localTime ? new Date(localTime).toISOString() : '');

	/**
	 * A readable local rendering, in the reader's own zone.
	 *
	 * Explicit components rather than `dateStyle`/`timeStyle`: those two cannot be
	 * combined with `timeZoneName`, and `Intl.DateTimeFormat` throws rather than
	 * ignoring the conflict. The zone is the one part that cannot be dropped — an
	 * interview time without it is the ambiguity this whole panel exists to avoid.
	 *
	 * Built once, outside the function, because constructing a formatter per row is
	 * the expensive half of `Intl`.
	 */
	const WHEN = new Intl.DateTimeFormat(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZoneName: 'short'
	});

	function when(date: Date): string {
		return WHEN.format(date);
	}

	function submit() {
		onschedule({
			title,
			mode,
			location: location.trim() || undefined,
			startsAt: instant,
			durationMinutes: Number(duration) || 45,
			notes: notes.trim() || undefined
		});
		scheduling = false;
		location = '';
		notes = '';
		localTime = '';
	}
</script>

<section class="flex flex-col border border-border bg-surface">
	<header class="flex items-center justify-between gap-2 border-b border-dashed border-border p-4">
		<h2 class="text-sm font-medium text-text">Interviews</h2>
		{#if canSchedule}
			<Button size="sm" onclick={() => (scheduling = true)}>
				<Icon icon={icons.schedule} class="size-3.5" />
				Schedule
			</Button>
		{/if}
	</header>

	{#if interviews.length === 0}
		<p class="p-4 text-xs text-text-subtle">
			Nothing booked. Scheduling one emails the candidate straight away.
		</p>
	{:else}
		<ul class="flex flex-col">
			{#each interviews as interview (interview.id)}
				<li class="flex flex-col gap-2 border-b border-border p-4 last:border-b-0">
					<div class="flex items-start justify-between gap-2">
						<span class="text-sm font-medium text-text">{interview.title}</span>
						{#if interview.cancelledAt}
							<Badge tone="neutral">Cancelled</Badge>
						{/if}
					</div>

					<div class="flex flex-wrap items-center gap-3 text-xs text-text-muted">
						<span class="flex items-center gap-1.5">
							<Icon icon={MODE_ICON[interview.mode]} class="size-3" />
							{MODES.find((option) => option.value === interview.mode)?.label ?? interview.mode}
						</span>
						<time class="flex items-center gap-1.5" datetime={interview.startsAt.toISOString()}>
							<Icon icon={icons.time} class="size-3" />
							<span data-numeric>{when(interview.startsAt)}</span>
						</time>
						<span data-numeric>{interview.durationMinutes} min</span>
					</div>

					{#if interview.location}
						<p class="text-xs break-words text-text-subtle">{interview.location}</p>
					{/if}

					{#if !interview.cancelledAt}
						<div class="flex flex-wrap gap-2 pt-1">
							<Button size="sm" href={calendarHref(interview.id)}>
								<Icon icon={icons.schedule} class="size-3.5" />
								Add to calendar
							</Button>
							{#if canSchedule}
								<Button size="sm" variant="ghost" onclick={() => (cancelling = interview)}>
									Cancel
								</Button>
							{/if}
						</div>
					{:else}
						<span class="text-2xs text-text-subtle">
							Cancelled {formatRelativeTime(interview.cancelledAt)}
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<Dialog
	bind:open={scheduling}
	title="Schedule an interview"
	description="The candidate is emailed the time and the details as soon as you book it."
>
	<div class="flex flex-col gap-4">
		<Field label="What it is">
			{#snippet children(control)}
				<Input {...control} bind:value={title} placeholder="First conversation" />
			{/snippet}
		</Field>

		<div class="grid gap-4 sm:grid-cols-2">
			<Field label="How">
				{#snippet children(control)}
					<Select {...control} bind:value={mode} items={MODES} />
				{/snippet}
			</Field>

			<Field label="How long" hint="Minutes.">
				{#snippet children(control)}
					<Input {...control} bind:value={duration} inputmode="numeric" mono />
				{/snippet}
			</Field>
		</div>

		<Field label="When" hint="In your own time zone. The candidate sees it converted to theirs.">
			{#snippet children(control)}
				<Input {...control} bind:value={localTime} type="datetime-local" />
			{/snippet}
		</Field>

		<Field
			label={mode === 'onsite' ? 'Address' : mode === 'phone' ? 'Number' : 'Link'}
			hint="Sent to the candidate. Optional if you will follow up separately."
		>
			{#snippet children(control)}
				<Input {...control} bind:value={location} />
			{/snippet}
		</Field>

		<Field label="Anything they should know" hint="Goes in the email. Not a place for opinions.">
			{#snippet children(control)}
				<Textarea {...control} bind:value={notes} rows={2} />
			{/snippet}
		</Field>
	</div>

	{#snippet footer()}
		<FormActions>
			{#snippet aside()}
				<Button variant="secondary" onclick={() => (scheduling = false)}>Cancel</Button>
			{/snippet}
			<Button
				variant="primary"
				loading={working}
				disabled={!instant || !title.trim()}
				onclick={submit}
			>
				Schedule and tell them
			</Button>
		</FormActions>
	{/snippet}
</Dialog>

<ConfirmDialog
	open={cancelling !== null}
	title="Cancel this interview?"
	description="The candidate is emailed to say it is off."
	detail="It stays on the record as cancelled rather than disappearing — somebody who was told about an interview needs their timeline to explain where it went."
	confirmLabel="Cancel interview"
	loading={working}
	onconfirm={() => {
		if (cancelling) oncancel(cancelling.id);
		cancelling = null;
	}}
	oncancel={() => (cancelling = null)}
/>
