<script lang="ts" module>
	export interface CommandAction {
		id: string;
		label: string;
		group: string;
		/** Extra words to match on that are not shown, e.g. synonyms. */
		keywords?: string;
		shortcut?: string;
		href?: string;
		run?: () => void;
	}
</script>

<script lang="ts">
	import { icons } from '#lib/design/icons';
	import Icon from '#lib/components/ui/Icon.svelte';

	import { goto } from '$app/navigation';
	import Kbd from '#lib/components/ui/Kbd.svelte';
	import { shortcuts } from '#lib/shortcuts.svelte';
	import { palette } from './palette.svelte';

	type Props = { actions: CommandAction[] };
	let { actions }: Props = $props();

	let search = $state('');

	$effect(() =>
		shortcuts.register({
			key: 'k',
			mod: true,
			description: 'Open the command palette',
			group: 'General',
			// Available while typing — the palette is how you leave wherever you are.
			allowInInput: true,
			run: () => palette.toggle()
		})
	);

	// Reset the query on close so reopening never shows a stale filter.
	$effect(() => {
		if (!palette.open) search = '';
	});

	/**
	 * Filtering, done here rather than by a library.
	 *
	 * A plain substring match over the label and any hidden keywords. Fuzzy ranking
	 * sounds better and behaves worse on a list this size — it puts surprising
	 * things first, and the whole value of a palette is that the thing you typed is
	 * the thing at the top.
	 */
	const matches = $derived(
		actions.filter((action) => {
			const query = search.trim().toLowerCase();
			if (!query) return true;
			return `${action.label} ${action.keywords ?? ''}`.toLowerCase().includes(query);
		})
	);

	const groups = $derived(
		[...new Set(matches.map((action) => action.group))].map((group) => ({
			group,
			items: matches.filter((action) => action.group === group)
		}))
	);

	/** The flat order the arrow keys walk, which is the order rendered. */
	const flat = $derived(groups.flatMap(({ items }) => items));

	let active = $state(0);
	let listEl = $state<HTMLDivElement | null>(null);
	let dialogEl = $state<HTMLDialogElement | null>(null);

	// A new query means a new list; keeping the old index would leave the highlight
	// on whatever happens to sit at that position now.
	$effect(() => {
		void search;
		active = 0;
	});

	$effect(() => {
		if (!dialogEl) return;
		if (palette.open && !dialogEl.open) dialogEl.showModal();
		else if (!palette.open && dialogEl.open) dialogEl.close();
	});

	function move(delta: number) {
		if (flat.length === 0) return;
		// Wraps, because a palette that stops at the end makes you change direction.
		active = (active + delta + flat.length) % flat.length;
		queueMicrotask(() => {
			listEl?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
		});
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			move(1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			move(-1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (flat[active]) select(flat[active]);
		}
	}

	function select(action: CommandAction) {
		palette.open = false;
		if (action.href) goto(action.href);
		else action.run?.();
	}
</script>

<!--
	Built on the native `<dialog>`, like `Dialog.svelte`: `showModal()` gives the
	focus trap, the escape key and the inert background, which is the hard part of a
	palette and the part the platform already does.
-->
<dialog
	bind:this={dialogEl}
	onclose={() => (palette.open = false)}
	onpointerdown={(event) => {
		if (event.target === dialogEl) dialogEl?.close();
	}}
	aria-label="Command palette"
	class="mx-auto mt-[15vh] mb-auto w-[calc(100vw-2rem)] max-w-xl overflow-hidden border border-border bg-surface-overlay p-0 text-text shadow-overlay backdrop:bg-scrim"
>
	{#if palette.open}
		<div class="flex items-center gap-3 border-b border-border px-(--fann-space-control)">
			<Icon icon={icons.search} class="size-4 shrink-0 text-text-subtle" />
			<!--
				Autofocused because opening a palette is asking to type. `<dialog>` moves
				focus to the first focusable child anyway; this makes it explicit.
			-->
			<!-- svelte-ignore a11y_autofocus -->
			<input
				bind:value={search}
				{onkeydown}
				autofocus
				type="text"
				role="combobox"
				aria-expanded="true"
				aria-controls="command-list"
				aria-activedescendant={flat[active] ? `command-${flat[active].id}` : undefined}
				placeholder="Search jobs, candidates, companies, actions…"
				class="h-14 w-full bg-transparent text-base text-text outline-none placeholder:text-text-subtle"
			/>
			<Kbd>Esc</Kbd>
		</div>

		<div bind:this={listEl} id="command-list" role="listbox" class="max-h-96 overflow-y-auto p-2">
			{#if flat.length === 0}
				<p class="px-4 py-10 text-center text-sm text-text-muted">No results for “{search}”</p>
			{/if}

			{#each groups as { group, items } (group)}
				<div role="group" aria-label={group}>
					<p class="px-3 pt-4 pb-1.5 text-2xs font-medium tracking-wide text-text-subtle uppercase">
						{group}
					</p>

					{#each items as action (action.id)}
						{@const index = flat.indexOf(action)}
						<!--
							No keyboard handler: focus stays in the input and the keyboard is
							driven through `aria-activedescendant`, which is the point of the
							pattern.
						-->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div
							id="command-{action.id}"
							role="option"
							tabindex="-1"
							aria-selected={index === active}
							data-active={index === active}
							onpointerenter={() => (active = index)}
							onclick={() => select(action)}
							class="flex h-(--fann-control-md) cursor-pointer items-center justify-between gap-3 px-3 text-sm text-text {index ===
							active
								? 'bg-surface-hover text-text-accent'
								: ''}"
						>
							<span class="truncate">{action.label}</span>
							{#if action.shortcut}
								<Kbd>{action.shortcut}</Kbd>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</dialog>
