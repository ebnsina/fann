<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import Button from '#lib/components/ui/Button.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import { verifyEmail } from '../auth.remote';

	// Named `status`, not `state` — that would shadow the `$state` rune.
	let status = $state<'working' | 'done' | 'failed'>('working');
	let message = $state('');

	/**
	 * Confirmation runs on load rather than behind a button: the user already
	 * clicked a link in their email, and asking them to click a second one adds
	 * nothing.
	 *
	 * The whole body is untracked and guarded. `verifyEmail` is a command, and
	 * calling one inside a tracked effect makes the effect depend on the command's
	 * own state — it re-runs, calls again, and the page hammers the endpoint.
	 */
	let started = false;

	$effect(() => {
		untrack(() => {
			if (started) return;
			started = true;

			const token = page.url.searchParams.get('token');
			if (!token) {
				status = 'failed';
				message = 'That link is missing its confirmation code.';
				return;
			}

			verifyEmail(token)
				.then(() => {
					status = 'done';
				})
				.catch((error: unknown) => {
					status = 'failed';
					message = error instanceof Error ? error.message : 'That link is no longer valid.';
				});
		});
	});
</script>

<svelte:head><title>Confirming your email · Fann</title></svelte:head>

<div class="flex flex-col gap-6">
	{#if status === 'working'}
		<div class="flex items-center gap-3 text-sm text-text-muted">
			<Spinner size="md" />
			Confirming your email address…
		</div>
	{:else if status === 'done'}
		<div class="flex flex-col gap-2">
			<h1 class="text-xl font-semibold text-text">Email confirmed</h1>
			<p class="text-sm text-text-muted">Your account is fully set up.</p>
		</div>
		<Button href="/" variant="primary">Continue</Button>
	{:else}
		<div class="flex flex-col gap-2">
			<h1 class="text-xl font-semibold text-text">That link did not work</h1>
			<p class="text-sm text-text-muted">{message}</p>
		</div>
		<Button href="/verify/sent" variant="primary">Send a new link</Button>
	{/if}
</div>
