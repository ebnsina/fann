<script lang="ts">
	import { cn } from '#lib/utils/cn';

	/**
	 * An on/off switch.
	 *
	 * A `<button role="switch">` rather than a styled checkbox, because that is what
	 * it is: it takes effect immediately rather than being submitted with a form.
	 * `aria-checked` is the whole contract, and space and enter come free with a
	 * real button.
	 *
	 * A hidden input is rendered only when a `name` is given, for the case where one
	 * of these does sit inside a form. It carries the current value so a submit
	 * sends something, and its `value` attribute is the default so a form reset
	 * restores that rather than blanking it.
	 */
	type Props = {
		checked?: boolean;
		/** Visible text beside the switch, and its accessible name. */
		label?: string;
		/**
		 * Names the switch when the visible label lives elsewhere — a settings row
		 * that puts its own text on the left, say. Without one of the two the
		 * control is announced as an unnamed switch, which is the same trap
		 * `Select` carries its `fallbackLabel` for.
		 */
		ariaLabel?: string;
		id?: string;
		name?: string;
		disabled?: boolean;
		class?: string;
		/**
		 * For controlled use, where the source of truth lives elsewhere — a server
		 * round trip, URL state. With `bind:checked` you do not need this.
		 */
		onCheckedChange?: (checked: boolean) => void;
	};

	let {
		checked = $bindable(false),
		label,
		ariaLabel,
		id,
		name,
		disabled = false,
		class: className,
		onCheckedChange
	}: Props = $props();

	const generatedId = $props.id();
	const inputId = $derived(id ?? generatedId);

	function toggle() {
		if (disabled) return;
		checked = !checked;
		onCheckedChange?.(checked);
	}
</script>

<div class={cn('flex items-center gap-3', className)}>
	<button
		type="button"
		role="switch"
		id={inputId}
		aria-checked={checked}
		aria-labelledby={label ? `${inputId}-label` : undefined}
		aria-label={label ? undefined : ariaLabel}
		{disabled}
		onclick={toggle}
		class="inline-flex h-4 w-7 shrink-0 items-center border transition-colors duration-(--fann-duration-fast) disabled:opacity-50 {checked
			? 'border-accent bg-accent'
			: 'border-border-strong bg-surface-active'}"
	>
		<span
			class="pointer-events-none block size-3 bg-surface transition-transform duration-(--fann-duration-fast) ease-(--ease-out) {checked
				? 'translate-x-3.5'
				: 'translate-x-0.5'}"
		></span>
	</button>

	{#if name}
		<input type="hidden" {name} value={checked ? 'on' : ''} />
	{/if}

	{#if label}
		<!--
			A `<label for>` cannot drive a button, so this is a span the button points
			at with `aria-labelledby`, plus a click handler for the same affordance a
			label would give.
		-->
		<span
			id="{inputId}-label"
			onclick={toggle}
			onkeydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					toggle();
				}
			}}
			role="presentation"
			class="cursor-pointer text-sm text-text select-none"
		>
			{label}
		</span>
	{/if}
</div>
