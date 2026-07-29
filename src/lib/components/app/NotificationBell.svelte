<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';
	import { unreadNotifications } from '../../../routes/notifications.remote';

	/**
	 * The bell in the header.
	 *
	 * A link to the list rather than a popover holding the list. A dropdown here
	 * would need its own paging, its own read-tracking and its own empty state —
	 * three copies of a page that already exists — and on a phone it would cover
	 * the thing it is describing.
	 *
	 * The count is unread only, and it is a number rather than a dot because "you
	 * have something" and "you have eleven things" are different situations and
	 * only one of them is worth interrupting what you were doing.
	 */
	const count = $derived(await unreadNotifications());
</script>

<a
	href="/me/notifications"
	class="relative flex h-(--fann-control-sm) items-center justify-center px-2 text-text-muted transition-colors hover:text-text"
>
	<Icon icon={icons.notifications} class="size-4" />

	{#if count > 0}
		<span
			class="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center bg-accent px-1 text-2xs font-medium text-accent-on"
			data-numeric
		>
			{count > 9 ? '9+' : count}
		</span>
	{/if}

	<span class="sr-only">
		Notifications{count > 0 ? ` — ${count} unread` : ''}
	</span>
</a>
