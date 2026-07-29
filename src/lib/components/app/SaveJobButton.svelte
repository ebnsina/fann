<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';

	/**
	 * Presentational on purpose.
	 *
	 * The saved state comes from a remote function under `(candidate)`, and a
	 * component in `lib` reaching across into a route group to import it is the kind
	 * of dependency that only points one way by accident. The page that owns the
	 * data owns the call; this draws it.
	 */
	type Props = {
		saved: boolean;
		/** Null when nobody is signed in — the button becomes a link to sign in. */
		ontoggle: (() => void) | null;
		busy?: boolean;
	};

	let { saved, ontoggle, busy = false }: Props = $props();
</script>

{#if ontoggle}
	<Button
		size="lg"
		variant="ghost"
		loading={busy}
		onclick={ontoggle}
		aria-pressed={saved}
		title={saved ? 'Remove from saved jobs' : 'Save for later'}
	>
		<!--
			The state is carried by `aria-pressed` and by the label, not by colour
			alone — a bookmark that only changes shade says nothing to anyone who cannot
			see the difference.
		-->
		<Icon icon={icons.save} class="size-4 {saved ? 'text-text-accent' : ''}" />
		{saved ? 'Saved' : 'Save'}
	</Button>
{:else}
	<!--
		A link rather than a disabled button. Saving needs an account, and the useful
		thing to do about that is offer one.
	-->
	<Button size="lg" variant="ghost" href="/login">
		<Icon icon={icons.save} class="size-4" />
		Save
	</Button>
{/if}
