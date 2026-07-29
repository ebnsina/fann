<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { toast } from '#lib/components/ui/toast.svelte';
	import { icons } from '#lib/design/icons';
	import { deleteAccount, deletionBlocker } from '../../account.remote';

	const { blocker } = $derived(await deletionBlocker());

	let confirming = $state(false);
	let closing = $state(false);

	async function close() {
		closing = true;
		try {
			await deleteAccount(null);
			// Navigated from here rather than by the command: kit@3 refuses a
			// `redirect()` inside one, and the account is already closed by the time
			// that would throw — leaving the page sitting there with an error on it.
			await goto('/?closed=1', { invalidateAll: true });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not close your account.');
			closing = false;
			confirming = false;
		}
	}
</script>

<svelte:head><title>Settings · Fann</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl text-text">Settings</h1>
		<p class="text-sm text-text-muted">Your data, and how to leave.</p>
	</div>

	<Card
		title="Download your data"
		description="Everything we hold about you, as a file you can keep."
	>
		<div class="flex flex-col gap-4">
			<p class="text-sm text-text-muted">
				Your profile, every application with its timeline, your saved jobs, a list of your CVs and
				any pay you have reported. The CV files themselves are on
				<a href="/me/documents" class="text-text-accent underline-offset-2 hover:underline">
					your CVs
				</a>
				page.
			</p>

			<div class="flex flex-wrap items-center gap-3">
				<!--
					A plain link, not a form. The route sets Content-Disposition, so the
					browser saves it — and a GET means somebody can bookmark it.
				-->
				<Button href="/me/export" variant="primary" download>
					<Icon icon={icons.document} class="size-4" />
					Download
				</Button>
				<span class="text-xs text-text-subtle">JSON, and small enough to open in anything.</span>
			</div>
		</div>
	</Card>

	<!--
		Its own card at the bottom, and the only destructive thing on the page. The
		privacy policy promises this; until now it promised an inbox.
	-->
	<Card title="Close your account" description="This cannot be undone.">
		<div class="flex flex-col gap-4">
			<div class="flex flex-col gap-2 text-sm text-text-muted">
				<p>We delete your profile, your CVs, your saved jobs and your sign-in details.</p>
				<p>
					Applications you already sent stay with the companies you sent them to, without your name
					on them. That is their record of their own hiring, and a company part-way through reading
					an application should not find the person simply gone. We cannot undo an application on
					their side, and we would rather say so than imply otherwise.
				</p>
			</div>

			{#if blocker}
				<!--
					Said before the button rather than after pressing it. Somebody who has
					to hand a company over first should find that out while deciding.
				-->
				<p
					class="flex items-start gap-2 border border-warning/25 bg-warning-subtle px-3 py-2 text-sm text-warning"
				>
					<Icon icon={icons.warning} class="mt-0.5 size-4 shrink-0" />
					{blocker}
				</p>
				<div>
					<Button href="/hire" size="sm" variant="ghost">Go to your companies</Button>
				</div>
			{:else}
				<div>
					<Button variant="danger" onclick={() => (confirming = true)}>Close my account</Button>
				</div>
			{/if}
		</div>
	</Card>
</div>

<ConfirmDialog
	bind:open={confirming}
	title="Close your account?"
	description="Your profile, CVs, saved jobs and sign-in details are deleted. This cannot be undone."
	detail="Applications you already sent stay with those companies, without your name. Download your data first if you want a copy."
	confirmLabel="Close my account"
	confirmPhrase="close my account"
	loading={closing}
	onconfirm={close}
	oncancel={() => (confirming = false)}
/>
