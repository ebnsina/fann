<script lang="ts">
	import { page } from '$app/state';
	import SiteChrome from '#lib/components/app/SiteChrome.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';

	let { children } = $props();

	/**
	 * The candidate's own area.
	 *
	 * A row of tabs rather than four more buttons in the header: these pages belong
	 * to one person's account and mean nothing to a visitor, and the header is
	 * shared with the public side.
	 */
	const TABS = [
		{ href: '/me/applications', label: 'Applications', icon: icons.inbox },
		{ href: '/me/notifications', label: 'Notifications', icon: icons.notifications },
		{ href: '/me/saved', label: 'Saved jobs', icon: icons.save },
		{ href: '/me/documents', label: 'Your CVs', icon: icons.document },
		{ href: '/me/profile', label: 'Profile', icon: icons.profile },
		{ href: '/me/settings', label: 'Settings', icon: icons.settings }
	];

	const current = $derived(page.url.pathname);
</script>

<SiteChrome>
	<div class="mx-auto flex max-w-(--fann-shell-width) flex-col gap-6 p-(--fann-space-page)">
		<nav
			aria-label="Your account"
			class="flex gap-px overflow-x-auto border border-border bg-border"
		>
			{#each TABS as tab (tab.href)}
				{@const active = current === tab.href || current.startsWith(`${tab.href}/`)}
				<a
					href={tab.href}
					aria-current={active ? 'page' : undefined}
					class="flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap transition-colors {active
						? 'bg-surface-raised font-medium text-text'
						: 'bg-surface text-text-muted hover:bg-surface-hover hover:text-text'}"
				>
					<Icon icon={tab.icon} class="size-4" />
					{tab.label}
				</a>
			{/each}
		</nav>

		{@render children()}
	</div>
</SiteChrome>
