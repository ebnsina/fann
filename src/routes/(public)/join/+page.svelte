<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';

	/**
	 * Someone typing `/join`, or following a link from an email, has to land
	 * somewhere. Two doors and nothing else — the argument for each one lives on
	 * the page behind it.
	 */
	const DOORS = [
		{
			href: '/join/candidate',
			icon: icons.profile,
			title: 'I am looking for a job',
			body: 'See what every job pays before you apply, and get an answer every time.',
			cta: 'Find a job'
		},
		{
			href: '/join/company',
			icon: icons.companies,
			title: 'I am hiring',
			body: 'Post jobs to people who already know the salary. Free, with no limit on jobs or team members.',
			cta: 'Start hiring'
		}
	];
</script>

<svelte:head>
	<title>Join Fann</title>
	<meta
		name="description"
		content="Create a Fann account, whether you are hiring or job hunting."
	/>
</svelte:head>

<div class="mx-auto flex max-w-4xl flex-col gap-10 px-(--fann-space-page) py-20">
	<div class="flex flex-col gap-3">
		<h1 class="text-3xl text-text">Which are you here for?</h1>
		<p class="max-w-xl text-base text-text-muted">
			One account does both, so this only decides where we start you off. You can change your mind
			later without signing up again.
		</p>
	</div>

	<div class="grid gap-px border border-border bg-border sm:grid-cols-2">
		{#each DOORS as door (door.href)}
			<a
				href={door.href}
				class="group flex flex-col gap-4 bg-surface p-(--fann-space-panel) transition-colors hover:bg-surface-hover"
			>
				<Icon icon={door.icon} class="size-6 text-text-accent" />
				<h2 class="text-lg font-semibold text-text">{door.title}</h2>
				<p class="flex-1 text-sm text-text-muted">{door.body}</p>
				<span class="flex items-center gap-2 text-sm font-medium text-text-accent">
					{door.cta}
					<Icon
						icon={icons.arrowRight}
						class="size-3.5 transition-transform duration-(--fann-duration-normal) group-hover:translate-x-1"
					/>
				</span>
			</a>
		{/each}
	</div>
</div>
