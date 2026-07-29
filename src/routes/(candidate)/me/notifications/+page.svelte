<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { toast } from '#lib/components/ui/toast.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime } from '#lib/utils/format';
	import {
		markAllNotificationsRead,
		markNotificationsRead,
		notificationList
	} from '../../../notifications.remote';

	const items = $derived(await notificationList());
	const unread = $derived(items.filter((item) => item.readAt === null));

	let working = $state(false);

	async function readAll() {
		working = true;
		try {
			await markAllNotificationsRead();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not update those.');
		} finally {
			working = false;
		}
	}

	/**
	 * Opening one marks it read, rather than a separate tick beside every row.
	 *
	 * Reading is the act; asking somebody to confirm they read something they just
	 * clicked into is a second job for no information. The bulk control stays for
	 * the case the list is the thing being dismissed rather than any one item.
	 */
	async function open(id: string, wasUnread: boolean) {
		if (!wasUnread) return;
		try {
			await markNotificationsRead({ ids: [id] });
		} catch {
			// Following the link matters more than the badge; a failure here corrects
			// itself the next time the list loads.
		}
	}
</script>

<svelte:head><title>Notifications · Fann</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div class="flex flex-col gap-1">
			<h1 class="text-2xl text-text">Notifications</h1>
			<p class="text-sm text-text-muted">
				Everything the product has told you, whether or not the email reached you.
			</p>
		</div>

		<div class="flex items-center gap-2">
			<Button href="/me/settings" variant="ghost" size="sm">
				<Icon icon={icons.settings} class="size-4" />
				Email settings
			</Button>
			{#if unread.length > 0}
				<Button variant="secondary" size="sm" loading={working} onclick={readAll}>
					Mark all read
				</Button>
			{/if}
		</div>
	</div>

	{#if items.length === 0}
		<EmptyState
			title="Nothing yet"
			description="Updates on your applications, interviews and offers will appear here."
		>
			{#snippet icon()}<Icon icon={icons.notifications} class="size-6" />{/snippet}
			{#snippet action()}
				<Button href="/jobs" variant="primary" size="sm">Browse jobs</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="flex flex-col border border-border">
			{#each items as item (item.id)}
				{@const isUnread = item.readAt === null}
				{#if item.url}
					<a
						href={item.url}
						onclick={() => open(item.id, isUnread)}
						class="border-b border-border p-(--fann-space-panel) transition-colors last:border-b-0 hover:bg-surface-hover {isUnread
							? 'bg-surface-raised'
							: 'bg-surface'}"
					>
						{@render row(item, isUnread)}
					</a>
				{:else}
					<div
						class="border-b border-border p-(--fann-space-panel) last:border-b-0 {isUnread
							? 'bg-surface-raised'
							: 'bg-surface'}"
					>
						{@render row(item, isUnread)}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>

{#snippet row(item: (typeof items)[number], isUnread: boolean)}
	<div class="flex flex-col gap-1">
		<div class="flex flex-wrap items-center gap-2">
			{#if isUnread}
				<!--
					A mark rather than bold text: weight is already doing work in this type
					scale, and a read row should not look like a different kind of thing to
					an unread one.
				-->
				<span class="size-1.5 shrink-0 bg-accent" aria-hidden="true"></span>
				<span class="sr-only">Unread.</span>
			{/if}
			<!--
				No category badge. Every title already says what kind of thing it is —
				"An update on your application…", "Interview scheduled…", "You have an
				offer…" — and a chip repeating the word beside it is the same sentence
				twice.
			-->
			<span class="text-sm text-text">{item.title}</span>
		</div>

		{#if item.body}
			<p class="text-sm text-text-muted">{item.body}</p>
		{/if}

		<time class="text-xs text-text-subtle">{formatRelativeTime(item.createdAt)}</time>
	</div>
{/snippet}
