<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import FormActions from '#lib/components/ui/FormActions.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { signup as form } from '../auth.remote';

	// `.preflight(signupSchema)` belongs here — it would validate client-side using
	// the same schema the server enforces. It is left off because in kit@3.0.0-next.12
	// the touched-tracking that gates issue display throws `state_unsafe_mutation`
	// from Kit's own focusout handler, so preflight silently blocks submission
	// without ever showing why. Server-side validation covers the same rules; add
	// preflight back once that lands. Verified against a bare docs-pattern form.
</script>

<svelte:head><title>Create an account · Fann</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-xl font-semibold text-text">Create an account</h1>
		<p class="text-sm text-text-muted">
			One account to apply for jobs and to hire — you never need a second.
		</p>
	</div>

	<form {...form} class="flex flex-col gap-4">
		<FormError issues={form.fields.allIssues()} />

		<Field label="Name" issues={form.fields.name.issues()}>
			{#snippet children(control)}
				<Input {...control} {...form.fields.name.as('text')} autocomplete="name" />
			{/snippet}
		</Field>

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

		<Field
			label="Password"
			issues={form.fields._password.issues()}
			hint="At least 12 characters. Length matters more than symbols."
		>
			{#snippet children(control)}
				<Input {...control} {...form.fields._password.as('password')} autocomplete="new-password" />
			{/snippet}
		</Field>

		<FormActions>
			<Button type="submit" variant="primary" size="lg" loading={form.pending > 0}>
				Create account
			</Button>
		</FormActions>
	</form>

	<p class="text-sm text-text-muted">
		Already have an account?
		<a href="/login" class="text-text-accent underline-offset-2 hover:underline">Sign in</a>
	</p>
</div>
