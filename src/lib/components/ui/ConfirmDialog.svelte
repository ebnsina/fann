<script lang="ts">
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import Field from './Field.svelte';
	import FormActions from './FormActions.svelte';
	import Icon from './Icon.svelte';
	import Input from './Input.svelte';
	import { icons } from '#lib/design/icons';

	type Props = {
		open?: boolean;
		title: string;
		/** What will happen, in a sentence. Read first by a screen reader. */
		description: string;
		/** Extra detail — what is lost, where it goes instead. */
		detail?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		/** `danger` for anything that destroys something a person can see. */
		tone?: 'danger' | 'primary';
		/**
		 * Require the exact phrase to be typed before confirming.
		 *
		 * For actions with no undo. A dialog you can dismiss with a reflexive Enter is
		 * not a confirmation, it is a speed bump — and the things it guards are
		 * exactly the ones nobody meant to do.
		 */
		confirmPhrase?: string;
		loading?: boolean;
		onconfirm: () => void;
		oncancel?: () => void;
	};

	let {
		open = $bindable(false),
		title,
		description,
		detail,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		tone = 'danger',
		confirmPhrase,
		loading = false,
		onconfirm,
		oncancel
	}: Props = $props();

	let typed = $state('');

	// Reset between openings, or the phrase typed last time still counts.
	$effect(() => {
		if (open) typed = '';
	});

	const ready = $derived(!confirmPhrase || typed.trim() === confirmPhrase);

	function cancel() {
		open = false;
		oncancel?.();
	}
</script>

<Dialog bind:open {title} {description} size="sm">
	<div class="flex flex-col gap-4">
		{#if detail}
			<p
				class="flex items-start gap-2.5 border border-dashed border-border p-(--fann-space-control) text-sm text-text-muted"
			>
				<Icon
					icon={tone === 'danger' ? icons.warning : icons.info}
					class="mt-0.5 size-4 shrink-0 {tone === 'danger' ? 'text-danger' : 'text-text-subtle'}"
				/>
				{detail}
			</p>
		{/if}

		{#if confirmPhrase}
			<Field label="Type {confirmPhrase} to confirm">
				{#snippet children(control)}
					<Input {...control} bind:value={typed} autocomplete="off" />
				{/snippet}
			</Field>
		{/if}
	</div>

	{#snippet footer()}
		<FormActions>
			{#snippet aside()}
				<Button variant="secondary" onclick={cancel}>{cancelLabel}</Button>
			{/snippet}
			<Button
				variant={tone === 'danger' ? 'danger' : 'primary'}
				disabled={!ready}
				{loading}
				onclick={onconfirm}
			>
				{confirmLabel}
			</Button>
		</FormActions>
	{/snippet}
</Dialog>
