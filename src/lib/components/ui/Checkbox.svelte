<script lang="ts">
	import { icons } from '#lib/design/icons';
	import Icon from './Icon.svelte';
	import { cn } from '#lib/utils/cn';

	/**
	 * A checkbox.
	 *
	 * A real `<input type="checkbox">` with the box drawn over it, rather than a
	 * `<button role="checkbox">`. The native element already does everything the
	 * ARIA version has to reimplement — space to toggle, label association, the
	 * indeterminate state, participation in a form and its reset — and it is the
	 * one thing assistive technology never has to be told about.
	 *
	 * The input is not `hidden` or `display: none`, which would take it out of the
	 * tab order. It is stretched over the box at zero opacity, so the real control
	 * is what receives the click and the focus ring; the visible square is
	 * decoration that follows it with `peer-*`.
	 */
	type Props = {
		checked?: boolean;
		indeterminate?: boolean;
		label?: string;
		id?: string;
		name?: string;
		value?: string;
		disabled?: boolean;
		class?: string;
		/**
		 * For controlled use, where the source of truth lives elsewhere — URL state,
		 * a server round trip. With `bind:checked` you do not need this.
		 */
		onCheckedChange?: (checked: boolean) => void;
	};

	let {
		checked = $bindable(false),
		indeterminate = $bindable(false),
		label,
		id,
		name,
		value,
		disabled = false,
		class: className,
		onCheckedChange
	}: Props = $props();

	const generatedId = $props.id();
	const inputId = $derived(id ?? generatedId);

	function onchange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		// Checking one resolves the mixed state; leaving it set would keep drawing a
		// dash over a box somebody has just made a decision about.
		indeterminate = false;
		onCheckedChange?.(input.checked);
	}
</script>

<!--
	The radius is capped at `sm` on purpose. The box is 16px, so anything from `lg`
	up clamps to a circle and the control starts reading as a radio button — "pick
	one" instead of "pick any". Shape is an affordance here, not decoration, so this
	one does not follow the product-wide radius step.
-->
<div class={cn('flex items-center gap-3', className)}>
	<span class="relative inline-flex size-4 shrink-0">
		<input
			type="checkbox"
			id={inputId}
			{name}
			{value}
			{disabled}
			bind:checked
			{indeterminate}
			{onchange}
			class="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
		/>

		<span
			aria-hidden="true"
			class="pointer-events-none inline-flex size-4 items-center justify-center border border-border-strong bg-surface text-accent-on transition-colors duration-(--fann-duration-fast) peer-checked:border-accent peer-checked:bg-accent peer-indeterminate:border-accent peer-indeterminate:bg-accent peer-disabled:opacity-50"
		>
			{#if indeterminate}
				<Icon icon={icons.indeterminate} class="size-3" />
			{:else if checked}
				<Icon icon={icons.check} class="size-3" />
			{/if}
		</span>
	</span>

	{#if label}
		<label for={inputId} class="cursor-pointer text-sm text-text select-none">{label}</label>
	{/if}
</div>
