<script lang="ts">
	import { page } from '$app/state';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Checkbox from '#lib/components/ui/Checkbox.svelte';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { toast } from '#lib/components/ui/toast.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime, label } from '#lib/utils/format';
	import {
		addWebhook,
		createApiKey,
		integrations,
		removeWebhook,
		revokeApiKey
	} from '../integrations.remote';

	const orgSlug = $derived(page.params.org ?? '');
	const data = $derived(await integrations(orgSlug));

	let keyName = $state('');
	let creating = $state(false);

	/**
	 * The key, held in memory until the page is left.
	 *
	 * Only the hash is stored, so this is genuinely the only moment it exists in
	 * readable form. The panel says that plainly rather than letting somebody
	 * assume they can come back for it.
	 */
	let issued = $state<{ name: string; token: string } | null>(null);

	let revoking = $state<{ id: string; name: string } | null>(null);

	let hookUrl = $state('');
	let hookEvents = $state<string[]>(['application.created']);
	let addingHook = $state(false);

	async function create() {
		creating = true;
		try {
			issued = await createApiKey({ orgSlug, name: keyName });
			keyName = '';
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not create that key.');
		} finally {
			creating = false;
		}
	}

	async function revoke() {
		if (!revoking) return;
		try {
			await revokeApiKey({ orgSlug, keyId: revoking.id });
			toast.success(`Revoked ${revoking.name}.`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not revoke that key.');
		} finally {
			revoking = null;
		}
	}

	async function addHook() {
		addingHook = true;
		try {
			const created = await addWebhook({ orgSlug, url: hookUrl, events: hookEvents as never });
			hookUrl = '';
			toast.success(`Added. Signing secret: ${created.secret}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not add that endpoint.');
		} finally {
			addingHook = false;
		}
	}

	function toggleEvent(event: string, on: boolean) {
		hookEvents = on ? [...hookEvents, event] : hookEvents.filter((e) => e !== event);
	}

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success('Copied.');
		} catch {
			toast.error('Could not copy. Select it and copy by hand.');
		}
	}
</script>

<svelte:head><title>API and webhooks · Fann</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl text-text">API and webhooks</h1>
		<p class="text-sm text-text-muted">
			Post jobs and updates from your own site or another tool, and get told when something happens
			here.
		</p>
	</div>

	{#if issued}
		<!--
			Shown once and never again, because only the hash is kept. Saying so here
			is the difference between somebody copying it now and coming back for it
			tomorrow.
		-->
		<div class="flex flex-col gap-3 border border-accent bg-accent-subtle p-(--fann-space-panel)">
			<div class="flex items-center gap-2">
				<Icon icon={icons.warning} class="size-4 text-text-accent" />
				<p class="text-sm font-medium text-text">Copy this now — you will not see it again</p>
			</div>
			<p class="text-xs text-text-muted">
				We only keep a hash of it. If you lose it, revoke the key and make another.
			</p>
			<div class="flex flex-wrap items-center gap-2">
				<code class="min-w-0 flex-1 truncate border border-border bg-surface px-3 py-2 text-xs">
					{issued.token}
				</code>
				<Button variant="secondary" size="sm" onclick={() => issued && copy(issued.token)}>
					Copy
				</Button>
				<Button variant="ghost" size="sm" onclick={() => (issued = null)}>Done</Button>
			</div>
		</div>
	{/if}

	<Card title="API keys" description="One per system. Name them so you can tell them apart.">
		<div class="flex flex-col gap-4">
			<div class="flex flex-wrap items-end gap-3">
				<Field label="Name" class="min-w-56 flex-1">
					{#snippet children(control)}
						<Input {...control} bind:value={keyName} placeholder="Careers page" />
					{/snippet}
				</Field>
				<Button
					variant="primary"
					loading={creating}
					disabled={keyName.trim().length === 0}
					onclick={create}
				>
					Create key
				</Button>
			</div>

			{#if data.keys.length > 0}
				<div class="flex flex-col gap-px border border-border bg-border">
					{#each data.keys as key (key.id)}
						<div class="flex flex-wrap items-center justify-between gap-3 bg-surface p-3">
							<span class="flex min-w-0 flex-col gap-0.5">
								<span class="flex flex-wrap items-center gap-2">
									<span class="text-sm text-text">{key.name}</span>
									{#if key.revokedAt}<Badge>Revoked</Badge>{/if}
								</span>
								<span class="text-xs text-text-subtle">
									<span data-numeric>{key.prefix}…</span>
									· created {formatRelativeTime(key.createdAt)}
									· {key.lastUsedAt
										? `last used ${formatRelativeTime(key.lastUsedAt)}`
										: 'never used'}
								</span>
							</span>
							{#if !key.revokedAt}
								<Button
									variant="ghost"
									size="xs"
									onclick={() => (revoking = { id: key.id, name: key.name })}
								>
									Revoke
								</Button>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<div
				class="flex flex-col gap-2 border-t border-dashed border-border pt-4 text-xs text-text-muted"
			>
				<p class="text-text">What a key can do</p>
				<p>
					Read your jobs and the applications you have received, post a job, and post to the feed as
					your company. A job posted this way still needs a salary range — there is no way in
					through the API that skips it.
				</p>
				<p>
					It cannot download anyone's CV. Those are only ever served by a link that re-checks who is
					asking and whether the file passed its virus scan.
				</p>
				<pre
					class="overflow-x-auto border border-border bg-surface-raised p-3 text-2xs text-text-muted">curl {page
						.url.origin}/api/v1/jobs \
  -H "Authorization: Bearer fann_sk_…" \
  -H "Content-Type: application/json" \
  -d '&#123;"title":"Backend Engineer","description":"…","salaryMin":90000,"salaryMax":120000,"salaryCurrency":"USD","salaryPeriod":"year","employmentType":"full_time","workMode":"remote","experienceLevel":"mid","publish":true&#125;'</pre>
			</div>
		</div>
	</Card>

	<Card title="Webhooks" description="We POST to your URL when something happens.">
		<div class="flex flex-col gap-4">
			<div class="flex flex-wrap items-end gap-3">
				<Field label="URL" class="min-w-64 flex-1">
					{#snippet children(control)}
						<Input {...control} bind:value={hookUrl} placeholder="https://example.com/fann" />
					{/snippet}
				</Field>
				<Button
					variant="primary"
					loading={addingHook}
					disabled={hookUrl.trim().length === 0 || hookEvents.length === 0}
					onclick={addHook}
				>
					Add
				</Button>
			</div>

			<div class="flex flex-wrap gap-4">
				{#each data.events as event (event)}
					<Checkbox
						checked={hookEvents.includes(event)}
						label={label(event.replace('.', ' '))}
						onCheckedChange={(on) => toggleEvent(event, on)}
					/>
				{/each}
			</div>

			{#if data.endpoints.length > 0}
				<div class="flex flex-col gap-px border border-border bg-border">
					{#each data.endpoints as endpoint (endpoint.id)}
						<div class="flex flex-wrap items-center justify-between gap-3 bg-surface p-3">
							<span class="flex min-w-0 flex-col gap-0.5">
								<span class="truncate text-sm text-text">{endpoint.url}</span>
								<span class="text-xs text-text-subtle">{endpoint.events.join(', ')}</span>
							</span>
							<Button
								variant="ghost"
								size="xs"
								onclick={async () => {
									await removeWebhook({ orgSlug, endpointId: endpoint.id });
									toast.success('Removed.');
								}}
							>
								Remove
							</Button>
						</div>
					{/each}
				</div>
			{/if}

			<p class="text-xs text-text-muted">
				Every delivery is signed. Check the <code>fann-signature</code> header against
				<code>HMAC-SHA256(secret, "&lt;fann-timestamp&gt;.&lt;body&gt;")</code>, and reject anything
				with an old timestamp — signing the body alone would make an old delivery valid forever. We
				retry a failing endpoint five times with a growing gap, then stop.
			</p>

			{#if data.deliveries.length > 0}
				<div class="flex flex-col gap-2 border-t border-dashed border-border pt-4">
					<p class="text-xs text-text">Recent deliveries</p>
					<div class="flex flex-col gap-px border border-border bg-border">
						{#each data.deliveries as delivery (delivery.id)}
							<div class="flex flex-wrap items-center justify-between gap-3 bg-surface px-3 py-2">
								<span class="flex min-w-0 flex-col">
									<span class="text-xs text-text">{delivery.event}</span>
									<span class="truncate text-2xs text-text-subtle">{delivery.url}</span>
								</span>
								<span class="flex items-center gap-2 text-2xs">
									{#if delivery.error}
										<span class="text-danger">{delivery.error}</span>
									{/if}
									<Badge>{label(delivery.status)}</Badge>
									<time class="text-text-subtle">{formatRelativeTime(delivery.createdAt)}</time>
								</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</Card>
</div>

<ConfirmDialog
	open={revoking !== null}
	title="Revoke {revoking?.name}?"
	description="Anything using this key stops working straight away. The key is kept as a revoked record rather than deleted, so you can still see it was in use."
	confirmLabel="Revoke it"
	onconfirm={revoke}
	oncancel={() => (revoking = null)}
/>
