<script lang="ts">
	import Form from '#lib/components/ui/Form.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import FormActions from '#lib/components/ui/FormActions.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import { icons } from '#lib/design/icons';
	import { VISIBILITY_OPTIONS, profileSchema } from '#lib/schemas/profile';
	import { myProfile, saveProfile } from '../../profile.remote';

	const profile = $derived(await myProfile());
	const fields = $derived(saveProfile.fields);

	// Client-side validation using the same schema the server enforces.
	saveProfile.preflight(profileSchema);
</script>

<svelte:head><title>Your profile · Fann</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl text-text">Your profile</h1>
		<p class="text-sm text-text-muted">
			None of this is required to apply for a job. It is here so you can say what you are looking
			for, and decide who gets to see it.
		</p>
	</div>

	<Form form={saveProfile} class="flex flex-col gap-6">
		<FormError issues={fields.allIssues()} />

		<Card title="About you" description="What a company reads first, if you let them.">
			<div class="flex flex-col gap-4">
				<Field
					label="Headline"
					issues={fields.headline.issues()}
					hint="One line. What you do, not where you did it."
				>
					{#snippet children(control)}
						<Input
							{...control}
							{...fields.headline.as('text', profile?.headline ?? '')}
							placeholder="Backend engineer, payments and reliability"
						/>
					{/snippet}
				</Field>

				<Field
					label="Summary"
					issues={fields.summary.issues()}
					hint="A few sentences. Markdown is supported."
				>
					{#snippet children(control)}
						<Textarea
							{...control}
							{...fields.summary.as('text', profile?.summary ?? '')}
							rows={6}
							placeholder="What you have worked on, and what you would like to work on next."
						/>
					{/snippet}
				</Field>
			</div>
		</Card>

		<!--
			Its own card, and above the optional details rather than buried under them.
			The privacy page promises this is the candidate's decision, and a control
			nobody finds is the same as not having one.
		-->
		<Card
			title="Who can see this"
			description="Applying always shows a company your profile and CV — this is about everyone else."
		>
			<fieldset class="flex flex-col gap-2">
				<legend class="sr-only">Profile visibility</legend>

				{#each VISIBILITY_OPTIONS as option (option.value)}
					{@const checked = (profile?.visibility ?? 'private') === option.value}
					<label
						class="flex cursor-pointer items-start gap-3 border border-border bg-surface p-3 hover:bg-surface-hover has-checked:border-accent has-checked:bg-accent-subtle"
					>
						<!-- `as('radio')` supplies name, value and type. -->
						<input
							{...fields.visibility.as('radio', option.value)}
							{checked}
							class="mt-0.5 size-4 shrink-0 accent-accent"
						/>
						<span class="flex flex-col gap-0.5">
							<span class="text-sm font-medium text-text">{option.label}</span>
							<span class="text-xs text-text-muted">{option.description}</span>
						</span>
					</label>
				{/each}
			</fieldset>

			<label
				class="mt-4 flex cursor-pointer items-center gap-3 border-t border-dashed border-border pt-4"
			>
				<input
					{...fields.openToWork.as('checkbox')}
					checked={profile?.openToWork ?? false}
					class="size-4 shrink-0 accent-accent"
				/>
				<span class="flex flex-col gap-0.5">
					<span class="text-sm text-text">I am open to work</span>
					<span class="text-xs text-text-muted">
						Shown to companies only if your profile is not private.
					</span>
				</span>
			</label>
		</Card>

		<Card
			title="What you are looking for"
			description="Optional, and never shown on a job you apply for."
		>
			<div class="flex flex-col gap-4">
				<div class="grid gap-4 sm:grid-cols-2">
					<Field
						label="Salary you are looking for"
						issues={fields.desiredSalaryMin.issues()}
						hint="A year, before tax."
					>
						{#snippet children(control)}
							<Input
								{...control}
								{...fields.desiredSalaryMin.as('number', profile?.desiredSalaryMin ?? undefined)}
								placeholder="120000"
							/>
						{/snippet}
					</Field>

					<Field label="Notice period" issues={fields.noticePeriodDays.issues()} hint="In days.">
						{#snippet children(control)}
							<Input
								{...control}
								{...fields.noticePeriodDays.as('number', profile?.noticePeriodDays ?? undefined)}
								placeholder="30"
							/>
						{/snippet}
					</Field>
				</div>

				<Field
					label="Right to work"
					issues={fields.workAuthorization.issues()}
					hint="In your own words — this saves both sides a conversation."
				>
					{#snippet children(control)}
						<Input
							{...control}
							{...fields.workAuthorization.as('text', profile?.workAuthorization ?? '')}
							placeholder="EU citizen, no sponsorship needed"
						/>
					{/snippet}
				</Field>
			</div>
		</Card>

		<Card title="Links" description="Anything you would rather show than describe.">
			<div class="flex flex-col gap-4">
				<Field label="Website" issues={fields.websiteUrl.issues()}>
					{#snippet children(control)}
						<Input
							{...control}
							{...fields.websiteUrl.as('url', profile?.websiteUrl ?? '')}
							placeholder="https://example.com"
						/>
					{/snippet}
				</Field>

				<Field label="LinkedIn" issues={fields.linkedinUrl.issues()}>
					{#snippet children(control)}
						<Input
							{...control}
							{...fields.linkedinUrl.as('url', profile?.linkedinUrl ?? '')}
							placeholder="https://www.linkedin.com/in/you"
						/>
					{/snippet}
				</Field>

				<Field label="GitHub" issues={fields.githubUrl.issues()}>
					{#snippet children(control)}
						<Input
							{...control}
							{...fields.githubUrl.as('url', profile?.githubUrl ?? '')}
							placeholder="https://github.com/you"
						/>
					{/snippet}
				</Field>
			</div>
		</Card>

		<FormActions>
			<Button type="submit" variant="primary">Save profile</Button>

			{#snippet aside()}
				{#if saveProfile.result?.saved}
					<span class="flex items-center gap-1.5 text-sm text-success">
						<Icon icon={icons.verified} class="size-4" />
						Saved.
					</span>
				{/if}
			{/snippet}
		</FormActions>
	</Form>
</div>
