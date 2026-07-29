<script lang="ts">
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import Kbd from '#lib/components/ui/Kbd.svelte';
	import { formatShortcut, shortcuts } from '#lib/shortcuts.svelte';

	let open = $state(false);

	$effect(() =>
		shortcuts.register({
			// `/` covers layouts where the browser reports the unshifted key.
			key: ['?', '/'],
			shift: true,
			description: 'Show keyboard shortcuts',
			group: 'General',
			run: () => (open = true)
		})
	);

	const groups = $derived(
		[...new Set(shortcuts.listed.map((s) => s.group ?? 'Other'))].map((group) => ({
			group,
			items: shortcuts.listed.filter((s) => (s.group ?? 'Other') === group)
		}))
	);
</script>

<Dialog bind:open title="Keyboard shortcuts" size="sm">
	<div class="flex flex-col gap-5">
		{#each groups as { group, items } (group)}
			<div class="flex flex-col gap-1.5">
				<p class="text-2xs font-medium tracking-wide text-text-subtle uppercase">{group}</p>
				{#each items as shortcut (formatShortcut(shortcut))}
					<div class="flex items-center justify-between gap-4">
						<span class="text-sm text-text">{shortcut.description}</span>
						<Kbd>{formatShortcut(shortcut)}</Kbd>
					</div>
				{/each}
			</div>
		{/each}
	</div>
</Dialog>
