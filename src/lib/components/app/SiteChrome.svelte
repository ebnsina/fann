<!--
	Header and footer for every public-facing page.

	One component rather than a layout per route group: the candidate area used to
	keep its own copy, and it silently drifted into linking at a route that no
	longer existed.
-->
<script lang="ts">
	import NotificationBell from './NotificationBell.svelte';
	import { page } from '$app/state';
	import ThemeToggle from '#lib/components/app/ThemeToggle.svelte';
	import Wordmark from '#lib/components/app/Wordmark.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Toaster from '#lib/components/ui/Toaster.svelte';
	import { icons } from '#lib/design/icons';
	import { cn } from '#lib/utils/cn';
	import { currentUser } from '../../../routes/(auth)/auth.remote';

	let { children } = $props();

	const user = $derived(await currentUser());

	// Only routes that exist. A nav link to a 404 is worse than a missing link.
	const NAV = [
		{ href: '/jobs', label: 'Jobs' },
		{ href: '/companies', label: 'Companies' },
		{ href: '/salaries', label: 'Pay' },
		{ href: '/feed', label: 'Feed' },
		{ href: '/for-employers', label: 'For employers' }
	];

	/**
	 * Footer columns, grouped by what someone is trying to do rather than by which
	 * part of the company owns the page. Nobody has ever looked for "Browse jobs"
	 * under a heading called "Product".
	 */
	const FOOTER = [
		{
			heading: 'Find work',
			links: [
				{ href: '/jobs', label: 'Browse jobs' },
				{ href: '/companies', label: 'Companies hiring' },
				{ href: '/salaries', label: 'What jobs pay' },
				{ href: '/feed', label: 'Feed' },
				{ href: '/join/candidate', label: 'Create an account' },
				{ href: '/me/applications', label: 'Your applications' }
			]
		},
		{
			heading: 'Hire people',
			links: [
				{ href: '/for-employers', label: 'Why hire here' },
				{ href: '/join/company', label: 'Set up your company' },
				{ href: '/hire', label: 'Your companies' }
			]
		},
		{
			heading: 'Account',
			links: [
				{ href: '/login', label: 'Sign in' },
				{ href: '/join', label: 'Create an account' },
				{ href: '/reset', label: 'Reset your password' }
			]
		},
		{
			heading: 'About',
			links: [
				{ href: '/about', label: 'What Fann is' },
				{ href: '/privacy', label: 'Privacy' },
				{ href: '/terms', label: 'Terms' }
			]
		}
	];

	/**
	 * The three promises, restated at the bottom of every page.
	 *
	 * A footer is where a visitor checks whether a site means what its landing page
	 * said, so these are the same commitments the product enforces — not a slogan.
	 */
	const PROMISES = [
		{ icon: icons.salary, text: 'Every job shows its pay' },
		{ icon: icons.message, text: 'Every application gets an answer' },
		{ icon: icons.privacy, text: 'Your CV is never sold' }
	];

	// Rendered on the server, so it is the deploy's year until the page is
	// re-rendered — which is correct for a copyright line and needs no client JS.
	const year = new Date().getFullYear();

	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}
</script>

<div class="flex min-h-svh flex-col">
	<!--
		Three columns rather than a flex row with a spacer: `1fr auto 1fr` centres the
		nav against the page, not against whatever is left over. With a spacer the
		menu drifts sideways the moment the buttons on the right change width — which
		they do, between signed in and signed out.
	-->
	<header
		class="fann-header sticky top-0 z-40 h-(--fann-topbar-height) bg-surface-veil backdrop-blur-(--fann-header-blur)"
	>
		<div
			class="mx-auto grid h-full max-w-(--fann-shell-width) grid-cols-[1fr_auto] items-center gap-4 px-(--fann-space-page) sm:grid-cols-[1fr_auto_1fr]"
		>
			<Wordmark />

			<nav class="hidden items-center gap-6 text-sm sm:flex" aria-label="Main">
				{#each NAV as item (item.href)}
					<a
						href={item.href}
						aria-current={isActive(item.href) ? 'page' : undefined}
						class={cn(
							'transition-colors',
							isActive(item.href) ? 'text-text' : 'text-text-muted hover:text-text'
						)}
					>
						{item.label}
					</a>
				{/each}
			</nav>

			<div class="flex items-center justify-end gap-2">
				<ThemeToggle />

				{#if user}
					<!--
						Inside its own boundary: the count is a separate query, and a slow
						or failing one must not blank the header it sits in.
					-->
					<svelte:boundary>
						<NotificationBell />
						{#snippet pending()}
							<span class="w-8"></span>
						{/snippet}
					</svelte:boundary>
					<Button href="/me/applications" variant="ghost" size="sm">Applications</Button>
					<Button href="/hire" size="sm">
						Hire
						<Icon icon={icons.arrowRight} class="size-3.5" />
					</Button>
				{:else}
					<Button href="/login" variant="ghost" size="sm">Sign in</Button>
					<Button href="/join/candidate" variant="primary" size="sm">
						Create account
						<Icon icon={icons.arrowRight} class="size-3.5" />
					</Button>
				{/if}
			</div>
		</div>
	</header>

	<main class="flex-1">
		{@render children()}
	</main>

	<footer class="border-t border-border bg-surface">
		<!-- Promise band: the product's three commitments, above the link columns. -->
		<div class="border-b border-dashed border-border">
			<ul
				class="mx-auto grid max-w-(--fann-shell-width) gap-4 px-(--fann-space-page) py-6 sm:grid-cols-3 sm:gap-8"
			>
				{#each PROMISES as promise (promise.text)}
					<!-- Centred within its own column from `sm` up, so the three read as one
					     row rather than three left-ragged starts. Left-aligned below that,
					     where they stack and centring would fight the rest of the page. -->
					<li class="flex items-center gap-2.5 text-sm text-text sm:justify-center">
						<Icon icon={promise.icon} class="size-4 shrink-0 text-text-accent" />
						{promise.text}
					</li>
				{/each}
			</ul>
		</div>

		<div
			class="mx-auto flex max-w-(--fann-shell-width) flex-col gap-10 px-(--fann-space-page) py-12 lg:flex-row lg:justify-between lg:gap-16"
		>
			<div class="flex max-w-sm flex-col gap-3">
				<Wordmark />
				<p class="text-sm text-text-muted">
					A job board and hiring tool built on two rules: publish the salary, and answer everyone
					who applies.
				</p>
			</div>

			<nav class="grid gap-8 sm:grid-cols-2 sm:gap-12 lg:grid-cols-4" aria-label="Footer">
				{#each FOOTER as group (group.heading)}
					<div class="flex flex-col gap-3">
						<h2 class="text-2xs font-medium tracking-wide text-text-subtle uppercase">
							{group.heading}
						</h2>
						<ul class="flex flex-col gap-2.5">
							{#each group.links as link (link.href)}
								<li>
									<a
										href={link.href}
										class="text-sm text-text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
									>
										{link.label}
									</a>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</nav>
		</div>

		<div class="border-t border-border">
			<div
				class="mx-auto flex max-w-(--fann-shell-width) flex-wrap items-center gap-x-4 gap-y-2 px-(--fann-space-page) py-5"
			>
				<p class="text-xs text-text-subtle">© {year} Fann</p>
				<p class="text-xs text-text-subtle">Made for people who would rather know the number.</p>
				<span
					class="ml-auto flex items-center gap-2 font-mono text-2xs tracking-wide text-text-subtle uppercase"
				>
					<span class="size-1.5 bg-success" aria-hidden="true"></span>
					Public beta
				</span>
			</div>
		</div>
	</footer>
</div>

<Toaster />
