<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import FormActions from '#lib/components/ui/FormActions.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { icons } from '#lib/design/icons';
	import { createOrganization, myOrganizations, pendingCompanyName } from '../organizations.remote';

	const organizations = $derived(await myOrganizations());
	// Typed on the company join page before confirming their email. Pre-filling it
	// here means nobody types their own company name twice.
	const suggestedName = $derived(await pendingCompanyName());
</script>

<svelte:head><title>Hire · Fann</title></svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-8 p-(--fann-space-page)">
	<div class="flex flex-col gap-2">
		<h1 class="text-2xl text-text">Hire on Fann</h1>
		<p class="text-sm text-text-muted">
			Post a job, read who applies, and give everyone an answer.
		</p>
	</div>

	{#if organizations.length > 0}
		<div class="flex flex-col gap-3">
			<h2 class="text-2xs font-medium tracking-wide text-text-subtle uppercase">Your companies</h2>

			<div class="flex flex-col border border-border">
				{#each organizations as organization (organization.id)}
					<a
						href="/hire/{organization.slug}/jobs"
						class="flex items-center justify-between gap-4 border-b border-border p-(--fann-space-panel) transition-colors last:border-b-0 hover:bg-surface-hover"
					>
						<div class="flex flex-col gap-0.5">
							<span class="text-sm font-medium text-text">{organization.name}</span>
							<span class="text-xs text-text-subtle">{organization.role.replace('_', ' ')}</span>
						</div>
						<Icon icon={icons.chevronRight} class="text-text-subtle" />
					</a>
				{/each}
			</div>
		</div>
	{:else}
		<EmptyState
			title="You are not on a hiring team yet"
			description="Set your company up below to post your first job, or ask a colleague to invite you to theirs."
		/>
	{/if}

	<Card title="Set up your company" description="You can change any of this later.">
		<form {...createOrganization} class="flex flex-col gap-4">
			<FormError issues={createOrganization.fields.allIssues()} />

			<Field label="Company name" issues={createOrganization.fields.name.issues()} required>
				{#snippet children(control)}
					<Input
						{...control}
						{...createOrganization.fields.name.as('text', suggestedName)}
						placeholder="Acme Inc"
					/>
				{/snippet}
			</Field>

			<Field
				label="Company website"
				issues={createOrganization.fields.domain.issues()}
				hint="Optional. We use it later to check you work there."
			>
				{#snippet children(control)}
					<Input
						{...control}
						{...createOrganization.fields.domain.as('text')}
						placeholder="acme.com"
					/>
				{/snippet}
			</Field>

			<FormActions>
				<Button type="submit" variant="primary" loading={createOrganization.pending > 0}>
					Set up company
				</Button>
			</FormActions>
		</form>
	</Card>
</div>
