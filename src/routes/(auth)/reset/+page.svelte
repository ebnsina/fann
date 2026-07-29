<script lang="ts">
	import { page } from '$app/state';
	import Button from '#lib/components/ui/Button.svelte';
	import FormActions from '#lib/components/ui/FormActions.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { requestPasswordReset, resetPassword } from '../auth.remote';

	// One route, two states: without a token you ask for a link, with one you choose
	// a new password. Splitting them into two routes would mean the email link and
	// the request form live in different places for no gain.
	const token = $derived(page.url.searchParams.get('token'));
</script>

<svelte:head><title>Reset your password · Fann</title></svelte:head>

{#if token}
	<div class="flex flex-col gap-6">
		<div class="flex flex-col gap-1">
			<h1 class="text-xl font-semibold text-text">Choose a new password</h1>
			<p class="text-sm text-text-muted">Every other device will be signed out once you set it.</p>
		</div>

		<form {...resetPassword} class="flex flex-col gap-4">
			<FormError issues={resetPassword.fields.allIssues()} />

			<input {...resetPassword.fields.token.as('hidden', token)} />

			<Field
				label="New password"
				issues={resetPassword.fields._password.issues()}
				hint="At least 12 characters."
			>
				{#snippet children(control)}
					<Input
						{...control}
						{...resetPassword.fields._password.as('password')}
						autocomplete="new-password"
					/>
				{/snippet}
			</Field>

			<FormActions>
				<Button type="submit" variant="primary" size="lg" loading={resetPassword.pending > 0}>
					Set password
				</Button>
			</FormActions>
		</form>
	</div>
{:else if requestPasswordReset.result?.sent}
	<div class="flex flex-col gap-2">
		<h1 class="text-xl font-semibold text-text">Check your inbox</h1>
		<p class="text-sm text-text-muted">
			If that address has an account, a reset link is on its way. The link expires in an hour.
		</p>
	</div>
{:else}
	<div class="flex flex-col gap-6">
		<div class="flex flex-col gap-1">
			<h1 class="text-xl font-semibold text-text">Reset your password</h1>
			<p class="text-sm text-text-muted">We will email you a link to set a new one.</p>
		</div>

		<form {...requestPasswordReset} class="flex flex-col gap-4">
			<FormError issues={requestPasswordReset.fields.allIssues()} />

			<Field label="Email" issues={requestPasswordReset.fields.email.issues()}>
				{#snippet children(control)}
					<Input
						{...control}
						{...requestPasswordReset.fields.email.as('email')}
						autocomplete="email"
						placeholder="you@company.com"
					/>
				{/snippet}
			</Field>

			<FormActions>
				<Button
					type="submit"
					variant="primary"
					size="lg"
					loading={requestPasswordReset.pending > 0}
				>
					Send reset link
				</Button>
			</FormActions>
		</form>

		<a
			href="/login"
			class="text-sm text-text-muted underline-offset-2 hover:text-text hover:underline"
		>
			Back to sign in
		</a>
	</div>
{/if}
