<script lang="ts">
	import { page } from '$app/state';
	import SiteChrome from '#lib/components/app/SiteChrome.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';

	let { children } = $props();

	/**
	 * The platform console.
	 *
	 * These tabs are navigation, not access control. Every function behind them
	 * checks staff status inside the service and returns not-found otherwise, so
	 * hiding the tabs would protect nothing on its own — and the check has to live
	 * where raw HTTP reaches it.
	 */
	const TABS = [
		{ href: '/admin', label: 'Overview', icon: icons.analytics },
		{ href: '/admin/moderation', label: 'Moderation', icon: icons.warning },
		{ href: '/admin/companies', label: 'Companies', icon: icons.companies },
		{ href: '/admin/jobs', label: 'Jobs', icon: icons.jobs },
		{ href: '/admin/people', label: 'People', icon: icons.profile },
		{ href: '/admin/email', label: 'Email', icon: icons.message }
	];

	const current = $derived(page.url.pathname);
</script>

<SiteChrome>
	<div class="mx-auto flex max-w-(--fann-shell-width) flex-col gap-6 p-(--fann-space-page)">
		<nav aria-label="Platform" class="flex gap-px overflow-x-auto border border-border bg-border">
			{#each TABS as tab (tab.href)}
				{@const active =
					tab.href === '/admin' ? current === tab.href : current.startsWith(tab.href)}
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
