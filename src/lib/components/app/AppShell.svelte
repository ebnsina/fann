<script lang="ts" module>
	import type { IconData } from '#lib/design/icons';
	export interface NavItem {
		label: string;
		href: string;
		icon: IconData;
		/** Shown as a count on the right of the row. */
		badge?: number;
	}

	export interface NavSection {
		label?: string;
		items: NavItem[];
	}
</script>

<script lang="ts">
	import { icons } from '#lib/design/icons';
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import Kbd from '#lib/components/ui/Kbd.svelte';
	import Toaster from '#lib/components/ui/Toaster.svelte';
	import { cn } from '#lib/utils/cn';
	import CommandPalette, { type CommandAction } from './CommandPalette.svelte';
	import { palette } from './palette.svelte';
	import ShortcutSheet from './ShortcutSheet.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	type Props = {
		sections: NavSection[];
		commands?: CommandAction[];
		/** Shown at the top of the sidebar — org switcher, or the product mark. */
		brand: Snippet;
		/** Right side of the top bar — page actions. */
		actions?: Snippet;
		title: string;
		children: Snippet;
	};

	let { sections, commands = [], brand, actions, title, children }: Props = $props();

	// A nav item is active when it is the exact route or a parent of it, but `/`
	// must not match everything.
	function isActive(href: string): boolean {
		const path = page.url.pathname;
		return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
	}
</script>

<div class="flex h-full bg-surface-sunken">
	<!-- Sidebar -->
	<nav
		class="hidden w-(--fann-sidebar-width) shrink-0 flex-col border-r border-border bg-surface md:flex"
		aria-label="Main"
	>
		<div
			class="flex h-(--fann-topbar-height) items-center border-b border-border px-(--fann-space-control)"
		>
			{@render brand()}
		</div>

		<!-- Same reason as `main` below: this scrolls, so it owns its absolute children. -->
		<div class="relative flex-1 overflow-y-auto p-3">
			{#each sections as section, index (section.label ?? index)}
				<div class={cn('flex flex-col gap-px', index > 0 && 'mt-4')}>
					{#if section.label}
						<p class="px-3 pt-2 pb-2 text-2xs font-medium tracking-wide text-text-subtle uppercase">
							{section.label}
						</p>
					{/if}

					{#each section.items as item (item.href)}
						{@const active = isActive(item.href)}
						<a
							href={item.href}
							aria-current={active ? 'page' : undefined}
							class={cn(
								'flex h-(--fann-control-sm) items-center gap-2.5 px-3 text-sm transition-colors duration-(--fann-duration-fast)',
								active
									? 'bg-surface-selected font-medium text-text-accent'
									: 'text-text-muted hover:bg-surface-hover hover:text-text'
							)}
						>
							<Icon icon={item.icon} class="size-4" />
							<span class="flex-1 truncate">{item.label}</span>
							{#if item.badge !== undefined && item.badge > 0}
								<span class="font-mono text-2xs text-text-subtle tabular-nums">{item.badge}</span>
							{/if}
						</a>
					{/each}
				</div>
			{/each}
		</div>
	</nav>

	<!-- Main column -->
	<div class="flex min-w-0 flex-1 flex-col">
		<header
			class="flex h-(--fann-topbar-height) shrink-0 items-center gap-4 border-b border-border bg-surface px-(--fann-space-page)"
		>
			<h1 class="truncate text-sm font-semibold text-text">{title}</h1>

			<div class="flex-1"></div>

			<!--
				A button, not an input: it opens the palette rather than filtering in
				place, and pretending otherwise sets the wrong expectation.
			-->
			<button
				type="button"
				onclick={() => palette.show()}
				class="hidden h-(--fann-control-sm) items-center gap-2 border border-border px-3 text-xs text-text-subtle transition-colors hover:border-border-strong hover:text-text-muted sm:flex"
			>
				<Icon icon={icons.search} class="size-3.5" />
				<span>Search</span>
				<Kbd class="ml-2">⌘K</Kbd>
			</button>

			<ThemeToggle />

			{#if actions}
				<div class="flex items-center gap-2">{@render actions()}</div>
			{/if}
		</header>

		<!--
			`relative` is load-bearing, not decoration.

			Tailwind's `sr-only` is `position: absolute`, and an absolutely positioned
			descendant with no positioned ancestor inside this scroller resolves
			against `<body>` instead — escaping the clip and landing at whatever
			document offset it had scrolled to. That grew the page by hundreds of
			pixels, so the *window* scrolled and took the sidebar with it, which is
			exactly what a fixed shell is supposed to prevent. Making this a
			containing block keeps every absolute child inside the thing that scrolls.
		-->
		<main class="relative min-h-0 flex-1 overflow-y-auto">
			{@render children()}
		</main>
	</div>
</div>

<CommandPalette actions={commands} />
<ShortcutSheet />
<Toaster />
