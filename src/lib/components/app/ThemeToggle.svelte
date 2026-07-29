<script lang="ts">
	import { icons } from '#lib/design/icons';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Tooltip from '#lib/components/ui/Tooltip.svelte';
	import { theme, type Theme } from '#lib/theme.svelte';

	// Cycling rather than a menu: three states, one target, no popover to open.
	const ORDER: Theme[] = ['light', 'dark', 'system'];
	const LABELS: Record<Theme, string> = {
		light: 'Light theme',
		dark: 'Dark theme',
		system: 'System theme'
	};

	function cycle() {
		const next = ORDER[(ORDER.indexOf(theme.preference) + 1) % ORDER.length];
		theme.set(next);
	}
</script>

<Tooltip content={LABELS[theme.preference]}>
	{#snippet children({ props })}
		<button
			{...props}
			type="button"
			onclick={cycle}
			aria-label={LABELS[theme.preference]}
			class="inline-flex size-7 items-center justify-center text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
		>
			{#if theme.preference === 'light'}
				<Icon icon={icons.themeLight} class="size-4" />
			{:else if theme.preference === 'dark'}
				<Icon icon={icons.themeDark} class="size-4" />
			{:else}
				<Icon icon={icons.themeSystem} class="size-4" />
			{/if}
		</button>
	{/snippet}
</Tooltip>
