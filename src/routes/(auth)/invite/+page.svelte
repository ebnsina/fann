<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';
	import { currentUser } from '../auth.remote';
	import { acceptInvite } from './invite.remote';

	const token = $derived(page.url.searchParams.get('token') ?? '');
	const user = $derived(await currentUser());

	let failure = $state<string | null>(null);

	/*
	 * Redeem once, on arrival.
	 *
	 * `untrack` plus a ran-once guard: a remote `command` inside a tracked `$effect`
	 * registers a dependency on its own state and re-runs forever. See the known
	 * traps in CLAUDE.md.
	 */
	let attempted = $state(false);
	$effect(() => {
		if (!token || !user || attempted) return;
		attempted = true;

		untrack(() => {
			void acceptInvite(token)
				.then(({ organizationSlug }) => goto(`/hire/${organizationSlug}/jobs`))
				.catch((cause) => {
					failure = cause instanceof Error ? cause.message : 'That invitation did not work.';
				});
		});
	});
</script>

<svelte:head><title>Join a hiring team · Fann</title></svelte:head>

<div class="flex flex-col gap-6">
	{#if !token}
		<div class="flex flex-col gap-2">
			<h1 class="text-xl font-semibold text-text">That link is incomplete</h1>
			<p class="text-sm text-text-muted">
				Invitation links carry a token. Ask whoever invited you to send it again.
			</p>
		</div>
	{:else if !user}
		<div class="flex flex-col gap-2">
			<h1 class="text-xl font-semibold text-text">Sign in to accept</h1>
			<p class="text-sm text-text-muted">
				The invitation was sent to a specific address, and it only works for the account that owns
				it. Sign in — or create an account with that address — and open the link again.
			</p>
		</div>
		<div class="flex flex-wrap gap-3">
			<Button href="/login" variant="primary">Sign in</Button>
			<Button href="/join">Create an account</Button>
		</div>
	{:else if failure}
		<div class="flex flex-col gap-2">
			<h1 class="text-xl font-semibold text-text">This invitation did not work</h1>
			<p role="alert" class="text-sm text-danger">{failure}</p>
			<p class="text-sm text-text-muted">
				It may have expired, been used already, or been sent to a different address than the one you
				are signed in with.
			</p>
		</div>
		<Button href="/hire">Go to your companies</Button>
	{:else}
		<p class="flex items-center gap-2 text-sm text-text-muted">
			<Icon icon={icons.time} class="size-4" />
			Adding you to the team…
		</p>
	{/if}
</div>
