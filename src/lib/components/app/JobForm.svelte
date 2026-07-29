<script lang="ts">
	import Form from '#lib/components/ui/Form.svelte';
	import type { RemoteForm } from '@sveltejs/kit';
	import Button from '#lib/components/ui/Button.svelte';
	import FormActions from '#lib/components/ui/FormActions.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import { icons } from '#lib/design/icons';
	import { toast } from '#lib/components/ui/toast.svelte';
	import { aiStatus, draftDescription } from '../../../routes/(employer)/hire/[org]/ai.remote';
	import {
		EMPLOYMENT_TYPE_OPTIONS,
		EXPERIENCE_LEVEL_OPTIONS,
		SALARY_PERIOD_OPTIONS,
		WORK_MODE_OPTIONS
	} from '#lib/schemas/job';

	type Props = {
		/** Either `createJob` or `updateJob` — the fields are identical. */
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- both forms share a shape, but not a type
		form: RemoteForm<any, any>;
		orgSlug: string;
		jobId?: string;
		/** Existing values when editing. */
		initial?: {
			title: string;
			description: string;
			employmentType: string;
			workMode: string;
			experienceLevel: string;
			salaryMin: number;
			salaryMax: number;
			salaryCurrency: string;
			salaryPeriod: string;
			equityRange: string | null;
			responseSlaDays: number | null;
		};
		submitLabel: string;
	};

	let { form, orgSlug, jobId, initial, submitLabel }: Props = $props();

	const fields = $derived(form.fields.draft);

	/**
	 * The selects keep their own state, and each submits through a hidden input.
	 *
	 * `Select` is display only here — given a `name` it is a form control, and
	 * submitting resets it, which silently blanked these after every save. These
	 * fields are required so the next save failed validation rather than corrupting
	 * anything, but the form still appeared to lose what had just been saved. See
	 * the trap in CLAUDE.md.
	 */
	let employmentType = $derived(initial?.employmentType ?? 'full_time');
	let workMode = $derived(initial?.workMode ?? 'onsite');
	let experienceLevel = $derived(initial?.experienceLevel ?? 'mid');
	let salaryPeriod = $derived(initial?.salaryPeriod ?? 'year');

	// A newline in the placeholder shows the expected shape at a glance.
	const placeholderBody = '## About the role\n\n…';

	const ai = $derived(await aiStatus());

	/**
	 * The description, held here so a draft can be written into it.
	 *
	 * Seeded from `initial` and re-seeded whenever that changes. The textarea is
	 * bound rather than spread from the field for the same reason the selects are —
	 * and here it also has to be writable by something other than typing.
	 */
	let description = $derived(initial?.description ?? '');
	let drafting = $state(false);
	let questions = $state<string[]>([]);

	/**
	 * Ask for a draft.
	 *
	 * Everything the model needs is already on the form, so this reads the current
	 * values rather than asking for them twice. Refusing early when the title is
	 * empty saves a call that would come back asking for it.
	 */
	async function draft() {
		const title = titleValue.trim();
		if (!title) {
			toast.error('Give the role a title first.');
			return;
		}

		drafting = true;
		questions = [];

		try {
			const result = await draftDescription({
				orgSlug,
				title,
				// The existing text is the brief. Somebody who typed three bullet points
				// wants those turned into a description, not thrown away.
				notes: description,
				salaryMin: Number(salaryMinValue) || 0,
				salaryMax: Number(salaryMaxValue) || 0,
				salaryCurrency: 'USD',
				salaryPeriod,
				workMode,
				employmentType,
				experienceLevel
			});

			if (result.ok) {
				description = result.value.description;
				questions = result.value.questions;
				toast.success('Draft written. Read it before you publish.');
			} else {
				toast.error(result.reason);
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not write a draft.');
		} finally {
			drafting = false;
		}
	}

	// Read back off the form so the draft reflects what is on screen now.
	let titleValue = $derived(initial?.title ?? '');
	let salaryMinValue = $derived(initial?.salaryMin?.toString() ?? '');
	let salaryMaxValue = $derived(initial?.salaryMax?.toString() ?? '');
</script>

<Form {form} class="flex flex-col gap-6">
	<FormError issues={form.fields.allIssues()} />

	<input {...form.fields.orgSlug.as('hidden', orgSlug)} />
	{#if jobId}
		<input {...form.fields.jobId.as('hidden', jobId)} />
	{/if}

	<Card title="The role" description="What a candidate sees first.">
		<div class="flex flex-col gap-4">
			<Field label="Job title" issues={fields.title.issues()} required>
				{#snippet children(control)}
					<Input
						{...control}
						name={fields.title.as('text').name}
						bind:value={titleValue}
						placeholder="Senior Backend Engineer"
					/>
				{/snippet}
			</Field>

			<Field
				label="Description"
				issues={fields.description.issues()}
				required
				hint="Markdown is supported. Say what the work actually is and how you hire."
			>
				{#snippet children(control)}
					<div class="flex flex-col gap-2">
						<div class="flex flex-wrap items-center justify-between gap-2">
							{#if ai.unavailable}
								<!--
									Said plainly rather than hiding the button. Somebody who read
									that this exists should find out why it is not here, and the
									message names the setting so whoever runs the deployment can
									fix it in one line.
								-->
								<p class="flex items-center gap-1.5 text-xs text-text-subtle">
									<Icon icon={icons.info} class="size-3.5 shrink-0" />
									{ai.unavailable} You can write this yourself — nothing else changes.
								</p>
							{:else}
								<p class="text-xs text-text-subtle">
									Type a few notes, then let us turn them into a first draft.
								</p>
								<Button size="xs" variant="secondary" loading={drafting} onclick={draft}>
									<Icon icon={icons.enthusiasm} class="size-3.5" />
									Write a first draft
								</Button>
							{/if}
						</div>

						<Textarea
							{...control}
							name={fields.description.as('text').name}
							bind:value={description}
							rows={16}
							placeholder={placeholderBody}
						/>

						{#if questions.length > 0}
							<!--
								What the model did not have. Shown as prompts rather than applied,
								because the answer is the employer's to give — a model filling
								these in itself is exactly how invented benefits get published.
							-->
							<div class="flex flex-col gap-1 border border-dashed border-border p-3">
								<p class="text-xs font-medium text-text">Worth adding, if you know:</p>
								<ul class="flex flex-col gap-1 text-xs text-text-muted">
									{#each questions as question (question)}
										<li>{question}</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>
				{/snippet}
			</Field>
		</div>
	</Card>

	<Card title="Shape" description="Used for filtering, so be accurate.">
		<div class="grid gap-4 sm:grid-cols-3">
			<Field label="Employment type" issues={fields.employmentType.issues()}>
				{#snippet children(control)}
					<Select {...control} bind:value={employmentType} items={EMPLOYMENT_TYPE_OPTIONS} />
					<input
						type="hidden"
						name={fields.employmentType.as('select').name}
						value={employmentType}
					/>
				{/snippet}
			</Field>

			<Field label="Work mode" issues={fields.workMode.issues()}>
				{#snippet children(control)}
					<Select {...control} bind:value={workMode} items={WORK_MODE_OPTIONS} />
					<input type="hidden" name={fields.workMode.as('select').name} value={workMode} />
				{/snippet}
			</Field>

			<Field label="Experience level" issues={fields.experienceLevel.issues()}>
				{#snippet children(control)}
					<Select {...control} bind:value={experienceLevel} items={EXPERIENCE_LEVEL_OPTIONS} />
					<input
						type="hidden"
						name={fields.experienceLevel.as('select').name}
						value={experienceLevel}
					/>
				{/snippet}
			</Field>
		</div>
	</Card>

	<!--
		Compensation is required, not optional, and the copy says so plainly. This is
		the product's one non-negotiable and the form should not be coy about it.
	-->
	<Card>
		<div class="flex flex-col gap-4">
			<div class="flex items-start gap-3">
				<Icon icon={icons.salary} class="mt-0.5 size-5 text-text-accent" />
				<div class="flex flex-col gap-0.5">
					<h2 class="text-base font-semibold text-text">Compensation</h2>
					<p class="text-sm text-text-muted">
						Required. Fann does not publish listings without a salary range.
					</p>
				</div>
			</div>

			<div class="grid gap-4 sm:grid-cols-4">
				<Field label="Minimum" issues={fields.salaryMin.issues()} required>
					{#snippet children(control)}
						<Input
							{...control}
							name={fields.salaryMin.as('number').name}
							type="number"
							bind:value={salaryMinValue}
							mono
							inputmode="numeric"
							placeholder="140000"
						/>
					{/snippet}
				</Field>

				<Field label="Maximum" issues={fields.salaryMax.issues()} required>
					{#snippet children(control)}
						<Input
							{...control}
							name={fields.salaryMax.as('number').name}
							type="number"
							bind:value={salaryMaxValue}
							mono
							inputmode="numeric"
							placeholder="195000"
						/>
					{/snippet}
				</Field>

				<Field label="Currency" issues={fields.salaryCurrency.issues()}>
					{#snippet children(control)}
						<Input
							{...control}
							{...fields.salaryCurrency.as('text', initial?.salaryCurrency ?? 'USD')}
							mono
							maxlength={3}
							class="uppercase"
						/>
					{/snippet}
				</Field>

				<Field label="Period" issues={fields.salaryPeriod.issues()}>
					{#snippet children(control)}
						<Select {...control} bind:value={salaryPeriod} items={SALARY_PERIOD_OPTIONS} />
						<input
							type="hidden"
							name={fields.salaryPeriod.as('select').name}
							value={salaryPeriod}
						/>
					{/snippet}
				</Field>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<Field
					label="Equity range"
					issues={fields.equityRange.issues()}
					hint="Optional, e.g. 0.05%–0.15%."
				>
					{#snippet children(control)}
						<Input
							{...control}
							{...fields.equityRange.as('text', initial?.equityRange ?? '')}
							mono
							placeholder="0.05%–0.15%"
						/>
					{/snippet}
				</Field>

				<Field
					label="Response promise"
					issues={fields.responseSlaDays.issues()}
					hint="Days you commit to replying in. Shown publicly and measured."
				>
					{#snippet children(control)}
						<Input
							{...control}
							{...fields.responseSlaDays.as('number', initial?.responseSlaDays ?? undefined)}
							mono
							inputmode="numeric"
							placeholder="5"
						/>
					{/snippet}
				</Field>
			</div>
		</div>
	</Card>

	<FormActions>
		{#snippet aside()}
			<Button href="/hire/{orgSlug}/jobs" variant="secondary" size="lg">Cancel</Button>
		{/snippet}
		<Button type="submit" variant="primary" size="lg" loading={form.pending > 0}>
			{submitLabel}
		</Button>
	</FormActions>
</Form>
