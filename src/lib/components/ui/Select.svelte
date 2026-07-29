<script lang="ts">
	import { icons } from '#lib/design/icons';
	import Icon from './Icon.svelte';
	import { cn } from '#lib/utils/cn';

	export type SelectOption = { value: string; label: string; disabled?: boolean };

	/**
	 * A select.
	 *
	 * A button plus a listbox, following the ARIA combobox pattern: the button owns
	 * the value and `aria-activedescendant` points at the option under the cursor,
	 * so focus never leaves the button and screen readers announce the option
	 * without the focus ring going anywhere surprising.
	 *
	 * The value is submitted by a plain `<input type="hidden">`. That is deliberate
	 * and is the reason this exists rather than a library one: a select that is
	 * itself a form control gets reset when the form submits, which silently blanked
	 * the control while the database still held the real value — and the next save
	 * wrote the blank. A hidden input carries its default in the `value` attribute,
	 * so a reset restores it rather than clearing it. See the trap in CLAUDE.md.
	 */
	type Props = {
		value?: string;
		items: SelectOption[];
		placeholder?: string;
		size?: 'sm' | 'md' | 'lg';
		disabled?: boolean;
		id?: string;
		name?: string;
		class?: string;
		/** For controlled use, where the value is owned elsewhere (e.g. URL state). */
		onValueChange?: (value: string) => void;
		'aria-invalid'?: boolean | 'true' | 'false' | undefined;
		'aria-describedby'?: string | undefined;
		'aria-label'?: string | undefined;
		'aria-labelledby'?: string | undefined;
	};

	let {
		value = $bindable(''),
		items,
		placeholder = 'Select…',
		size = 'md',
		disabled = false,
		id,
		name,
		class: className,
		onValueChange,
		...rest
	}: Props = $props();

	const SIZES = {
		sm: 'h-(--fann-control-sm)',
		md: 'h-(--fann-control-md)',
		lg: 'h-(--fann-control-lg)'
	} as const;

	const generatedId = $props.id();
	const triggerId = $derived(id ?? generatedId);
	const listboxId = $derived(`${generatedId}-listbox`);

	const selectedLabel = $derived(items.find((item) => item.value === value)?.label);

	/**
	 * A name for the control, when nothing else provides one.
	 *
	 * `combobox` does not take its accessible name from its contents the way
	 * `button` does — so the visible text inside the trigger names a button and
	 * names nothing here. When `Field` wraps this it passes an `id` and renders a
	 * real `<label for>`, which is the better source; an `aria-label` on top of a
	 * visible label would override it and is worse than nothing. So this fills in
	 * only for the unlabelled case, which is a Select dropped straight onto a page.
	 */
	const fallbackLabel = $derived(
		id || rest['aria-label'] || rest['aria-labelledby'] ? undefined : placeholder
	);
	const selectable = $derived(items.filter((item) => !item.disabled));

	let open = $state(false);
	/** Index into `items`, not `selectable` — it addresses the rendered rows. */
	let active = $state(-1);
	let trigger = $state<HTMLButtonElement | null>(null);
	let list = $state<HTMLUListElement | null>(null);

	/** Type-ahead, the way a native select behaves. Cleared after a pause. */
	let typed = '';
	let typedAt = 0;

	function openList() {
		if (disabled) return;
		open = true;
		const current = items.findIndex((item) => item.value === value);
		active = current >= 0 ? current : items.indexOf(selectable[0]);
	}

	function close(focusTrigger = true) {
		open = false;
		active = -1;
		if (focusTrigger) trigger?.focus();
	}

	function choose(item: SelectOption) {
		if (item.disabled) return;
		value = item.value;
		onValueChange?.(item.value);
		close();
	}

	/** Step to the next selectable row, skipping disabled ones and wrapping. */
	function move(delta: number) {
		if (selectable.length === 0) return;
		const order = items
			.map((item, index) => ({ item, index }))
			.filter(({ item }) => !item.disabled);
		const at = order.findIndex(({ index }) => index === active);
		const next = at === -1 ? 0 : (at + delta + order.length) % order.length;
		active = order[next].index;
		scrollActiveIntoView();
	}

	function scrollActiveIntoView() {
		// After the DOM has the new `aria-activedescendant`, so the row exists.
		queueMicrotask(() => {
			list?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
		});
	}

	function onkeydown(event: KeyboardEvent) {
		if (disabled) return;

		if (!open) {
			if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
				event.preventDefault();
				openList();
			}
			return;
		}

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				move(1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				move(-1);
				break;
			case 'Home':
				event.preventDefault();
				active = items.indexOf(selectable[0]);
				scrollActiveIntoView();
				break;
			case 'End':
				event.preventDefault();
				active = items.indexOf(selectable[selectable.length - 1]);
				scrollActiveIntoView();
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				if (items[active]) choose(items[active]);
				break;
			case 'Escape':
				event.preventDefault();
				close();
				break;
			case 'Tab':
				// Let focus leave, but do not leave a menu hanging over the next field.
				close(false);
				break;
			default:
				if (event.key.length === 1) typeAhead(event.key);
		}
	}

	function typeAhead(char: string) {
		const now = Date.now();
		typed = now - typedAt > 600 ? char : typed + char;
		typedAt = now;

		const match = items.findIndex(
			(item) => !item.disabled && item.label.toLowerCase().startsWith(typed.toLowerCase())
		);

		if (match >= 0) {
			active = match;
			scrollActiveIntoView();
		}
	}
</script>

<svelte:window
	onpointerdown={(event) => {
		// A click anywhere outside closes. Checked against the rendered nodes rather
		// than a wrapper, so a portal-free popup still behaves like one.
		if (!open) return;
		const target = event.target as Node;
		if (!trigger?.contains(target) && !list?.contains(target)) close(false);
	}}
/>

<div class={cn('relative', className)}>
	<button
		bind:this={trigger}
		type="button"
		id={triggerId}
		role="combobox"
		aria-expanded={open}
		aria-controls={listboxId}
		aria-haspopup="listbox"
		aria-label={fallbackLabel}
		aria-activedescendant={open && items[active] ? `${listboxId}-${active}` : undefined}
		{disabled}
		{onkeydown}
		onclick={() => (open ? close() : openList())}
		class={cn(
			'inline-flex w-full items-center justify-between gap-2 border border-border bg-surface px-(--fann-space-control) text-sm text-text transition-colors duration-(--fann-duration-fast) hover:border-border-strong disabled:opacity-50 aria-[invalid=true]:border-danger',
			open && 'border-border-accent',
			SIZES[size]
		)}
		{...rest}
	>
		<span class={cn('truncate', !selectedLabel && 'text-text-subtle')}>
			{selectedLabel ?? placeholder}
		</span>
		<Icon icon={icons.chevronDown} class="size-3.5 shrink-0 text-text-muted" />
	</button>

	{#if name}
		<!-- The value the form actually submits. See the note at the top. -->
		<input type="hidden" {name} {value} />
	{/if}

	{#if open}
		<ul
			bind:this={list}
			id={listboxId}
			role="listbox"
			aria-labelledby={triggerId}
			class="absolute z-50 mt-1 max-h-64 w-full min-w-max overflow-y-auto border border-border bg-surface-overlay py-1 shadow-popover"
		>
			{#each items as item, index (item.value)}
				<!--
					No keyboard handler here on purpose. In the combobox pattern focus stays
					on the trigger and the keyboard is driven through `aria-activedescendant`
					— an option that took focus itself would break exactly the behaviour the
					pattern exists to provide.
				-->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id="{listboxId}-{index}"
					role="option"
					aria-selected={item.value === value}
					aria-disabled={item.disabled}
					data-active={index === active}
					onpointerenter={() => !item.disabled && (active = index)}
					onclick={() => choose(item)}
					class={cn(
						'flex h-(--fann-row-height-compact) cursor-pointer items-center justify-between gap-2 px-(--fann-space-control) text-sm text-text',
						index === active && 'bg-surface-hover',
						item.value === value && 'text-text-accent',
						item.disabled && 'pointer-events-none opacity-50'
					)}
				>
					<span class="truncate">{item.label}</span>
					{#if item.value === value}
						<Icon icon={icons.check} class="size-3.5 shrink-0" />
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
