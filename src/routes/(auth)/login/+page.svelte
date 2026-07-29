<script lang="ts">
	import { loginSchema } from '#lib/schemas/auth';
	import Form from '#lib/components/ui/Form.svelte';
	import { page } from '$app/state';
	import Button from '#lib/components/ui/Button.svelte';
	import FormActions from '#lib/components/ui/FormActions.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { login as form } from '../auth.remote';

	// See the note in signup/+page.svelte for why `.preflight()` is not used yet.

	const justReset = $derived(page.url.searchParams.has('reset'));

	// Client-side validation using the same schema the server enforces.
	form.preflight(loginSchema);
</script>

<svelte:head><title>Sign in · Fann</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-xl font-semibold text-text">Sign in</h1>
		<p class="text-sm text-text-muted">Welcome back.</p>
	</div>

	{#if justReset}
		<p class="border border-success/25 bg-success-subtle px-3 py-2 text-sm text-success">
			Your password has been changed. Sign in with it below.
		</p>
	{/if}

	<Form {form} class="flex flex-col gap-4">
		<FormError issues={form.fields.allIssues()} />

		<Field label="Email" issues={form.fields.email.issues()}>
			{#snippet children(control)}
				<Input
					{...control}
					{...form.fields.email.as('email')}
					autocomplete="email"
					placeholder="you@company.com"
				/>
			{/snippet}
		</Field>

		<Field label="Password" issues={form.fields._password.issues()}>
			{#snippet children(control)}
				<Input
					{...control}
					{...form.fields._password.as('password')}
					autocomplete="current-password"
				/>
			{/snippet}
		</Field>

		<!-- Errors thrown by the handler (bad credentials, rate limit) land here. -->
		<FormActions>
			<Button type="submit" variant="primary" size="lg" loading={form.pending > 0}>Sign in</Button>
		</FormActions>
	</Form>

	<div class="flex items-center justify-between text-sm">
		<a href="/reset" class="text-text-muted underline-offset-2 hover:text-text hover:underline">
			Forgot password?
		</a>
		<a href="/join" class="text-text-accent underline-offset-2 hover:underline">
			Create an account
		</a>
	</div>
</div>
