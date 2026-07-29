<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import FormActions from '#lib/components/ui/FormActions.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import { icons } from '#lib/design/icons';
	import { EXPERIENCE_LEVEL_OPTIONS, SALARY_PERIOD_OPTIONS } from '#lib/schemas/job';
	import { reportOptions, reportSalary } from '../salaries.remote';

	const options = $derived(await reportOptions());
	const fields = $derived(reportSalary.fields);
	const result = $derived(reportSalary.result);

	const occupationItems = $derived(
		options.occupations.map((row) => ({ value: row.id, label: row.name }))
	);

	const locationItems = $derived([
		{ value: '', label: 'Rather not say' },
		...options.locations.map((row) => ({ value: row.id, label: `${row.city}, ${row.country}` }))
	]);
</script>

<svelte:head>
	<title>Report your pay · Fann</title>
	<meta
		name="description"
		content="Tell us what you are actually paid. It is anonymous, and it is what makes the reported figures on Fann worth reading."
	/>
</svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-6 px-(--fann-space-page) py-12">
	<div class="flex flex-col gap-3">
		<a
			href="/salaries"
			class="flex w-fit items-center gap-1.5 text-xs text-text-muted hover:text-text"
		>
			<Icon icon={icons.chevronLeft} class="size-3" />
			What jobs pay
		</a>

		<h1 class="text-3xl text-text">What are you actually paid?</h1>
		<p class="text-base text-text-muted">
			Job listings say what a company hopes to pay. This is the other half. It takes about a minute,
			you do not need an account, and we do not ask who you work for.
		</p>
	</div>

	{#if result?.saved}
		<!--
			The figures only move on the next rebuild, so the confirmation says that.
			A thank-you note beside a page that has not changed reads as a form that
			silently failed.
		-->
		<div
			class="flex flex-col gap-3 border border-success/25 bg-success-subtle p-(--fann-space-panel)"
		>
			<p class="flex items-center gap-2 text-sm font-medium text-success">
				<Icon icon={icons.verified} class="size-4" />
				Thank you — that is recorded.
			</p>
			<p class="text-sm text-text-muted">
				{#if result.publishes}
					There are <span data-numeric>{result.reports}</span> reports for this role and level, so it
					is published. Your figure will be part of it after tonight's update.
				{:else}
					There are <span data-numeric>{result.reports}</span>
					so far. We publish nothing for a role until there are
					<span data-numeric>{result.reports + result.needed}</span>, because a handful of numbers
					is not a going rate.
				{/if}
			</p>
			<div>
				<Button href="/salaries?source=reported" size="sm">See what people report</Button>
			</div>
		</div>
	{/if}

	<form {...reportSalary} class="flex flex-col gap-6">
		<FormError issues={fields.allIssues()} />

		<Card title="The job" description="Enough to group it with others like it.">
			<div class="flex flex-col gap-4">
				<Field
					label="What is the job called?"
					issues={fields.jobTitle.issues()}
					required
					hint="Your own title, however it is written on your contract."
				>
					{#snippet children(control)}
						<Input
							{...control}
							{...fields.jobTitle.as('text')}
							placeholder="Senior Backend Engineer"
						/>
					{/snippet}
				</Field>

				<Field
					label="Closest match"
					issues={fields.occupationId.issues()}
					required
					hint="Which group this counts towards. Pick the nearest — it does not have to be exact."
				>
					{#snippet children(control)}
						<Select {...control} {...fields.occupationId.as('select')} items={occupationItems} />
					{/snippet}
				</Field>

				<div class="grid gap-4 sm:grid-cols-2">
					<Field label="Level" issues={fields.experienceLevel.issues()} required>
						{#snippet children(control)}
							<Select
								{...control}
								{...fields.experienceLevel.as('select')}
								items={[...EXPERIENCE_LEVEL_OPTIONS]}
							/>
						{/snippet}
					</Field>

					<Field
						label="Years doing this kind of work"
						issues={fields.yearsOfExperience.issues()}
						hint="Optional."
					>
						{#snippet children(control)}
							<Input {...control} {...fields.yearsOfExperience.as('number')} placeholder="6" />
						{/snippet}
					</Field>
				</div>

				<Field
					label="Where"
					issues={fields.locationId.issues()}
					hint="Optional. Only used once a place has enough reports to say something on its own."
				>
					{#snippet children(control)}
						<Select {...control} {...fields.locationId.as('select')} items={locationItems} />
					{/snippet}
				</Field>
			</div>
		</Card>

		<Card title="The pay" description="Base salary only — before tax, and without bonus or equity.">
			<div class="grid gap-4 sm:grid-cols-3">
				<Field label="Amount" issues={fields.salaryAmount.issues()} required>
					{#snippet children(control)}
						<Input {...control} {...fields.salaryAmount.as('number')} placeholder="145000" />
					{/snippet}
				</Field>

				<Field label="Currency" issues={fields.salaryCurrency.issues()} required>
					{#snippet children(control)}
						<Input
							{...control}
							{...fields.salaryCurrency.as('text', 'USD')}
							placeholder="USD"
							maxlength={3}
						/>
					{/snippet}
				</Field>

				<Field label="Per" issues={fields.salaryPeriod.issues()} required>
					{#snippet children(control)}
						<Select
							{...control}
							{...fields.salaryPeriod.as('select')}
							items={[...SALARY_PERIOD_OPTIONS]}
						/>
					{/snippet}
				</Field>
			</div>
		</Card>

		<FormActions>
			<Button type="submit" variant="primary">Report it</Button>
		</FormActions>
	</form>

	<!--
		Said here rather than only in a policy. Somebody typing their salary into a
		box is owed a plain account of what happens to it, at the moment they are
		deciding whether to.
	-->
	<div class="flex flex-col gap-2 border border-border bg-surface p-(--fann-space-panel)">
		<h2 class="text-sm font-medium text-text">What we do with this</h2>
		<ul class="flex flex-col gap-1.5 text-xs text-text-muted">
			<li>
				It is never shown on its own. Only the spread across at least eight reports is published, so
				no single figure can be picked out as yours.
			</li>
			<li>
				We do not ask who you work for, and reported pay is kept separate from what companies
				advertise — the two are different measurements and we never mix them.
			</li>
			<li>
				We have not verified it, and the page that shows it says so. We would rather publish an
				honest unverified number than pretend to a check we did not make.
			</li>
		</ul>
	</div>
</div>
