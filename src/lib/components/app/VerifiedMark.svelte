<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import Tooltip from '#lib/components/ui/Tooltip.svelte';
	import { icons } from '#lib/design/icons';

	/**
	 * The check beside a company's name.
	 *
	 * Rendered only where `domainVerifiedAt` is actually set. A mark that appears
	 * for everybody is decoration, and the one thing this must never do is imply a
	 * check that did not happen — which is why it carries a tooltip saying what was
	 * checked rather than the bare word "verified".
	 */
	type Props = { size?: 'sm' | 'md' };
	let { size = 'sm' }: Props = $props();
</script>

<Tooltip content="This company proved it owns its web domain">
	{#snippet children({ props })}
		<span {...props} class="inline-flex shrink-0 items-center text-text-accent">
			<Icon
				icon={icons.verifiedCompany}
				class={size === 'sm' ? 'size-3.5' : 'size-4'}
				label="Verified company"
			/>
		</span>
	{/snippet}
</Tooltip>
