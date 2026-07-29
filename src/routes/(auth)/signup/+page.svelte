<script lang="ts">
	import Form from '#lib/components/ui/Form.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import FormActions from '#lib/components/ui/FormActions.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { signupSchema } from '#lib/schemas/auth';
	import { signup as form } from '../auth.remote';

	// The same schema the server enforces, checked in the browser first. One
	// definition, so what somebody is told while typing cannot drift from what the
	// server will accept.
	form.preflight(signupSchema);
</script>

<svelte:head><title>Create an account · Fann</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-xl font-semibold text-text">Create an account</h1>
		<p class="text-sm text-text-muted">
			One account to apply for jobs and to hire — you never need a second.
		</p>
	</div>

	<Form {form} class="flex flex-col gap-4">
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
	</Form>

	<p class="text-sm text-text-muted">
		Already have an account?
		<a href="/login" class="text-text-accent underline-offset-2 hover:underline">Sign in</a>
	</p>
</div>
