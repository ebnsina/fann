<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils/cn';

	type Issue = { message: string };

	type Props = {
		label: string;
		/** Pass a remote form field's `issues()` straight through. */
		issues?: Issue[] | undefined;
		hint?: string;
		required?: boolean;
		class?: string;
		/**
		 * Receives the wiring the control needs. Spread `control` onto the input so
		 * the label, hint and error messages are correctly associated.
		 */
		children: Snippet<
			[
				{
					id: string;
					'aria-describedby': string | undefined;
					'aria-invalid': 'true' | undefined;
				}
			]
		>;
	};

	let { label, issues, hint, required = false, class: className, children }: Props = $props();

	const id = $props.id();
	const hintId = `${id}-hint`;
	const errorId = `${id}-error`;

	const invalid = $derived(Boolean(issues?.length));
	const describedBy = $derived(
		[hint ? hintId : null, invalid ? errorId : null].filter(Boolean).join(' ') || undefined
	);
</script>

<div class={cn('flex flex-col gap-2', className)}>
	<label for={id} class="flex items-center gap-1 text-xs font-medium text-text">
		{label}
		{#if required}
			<span class="text-danger" aria-hidden="true">*</span>
			<span class="sr-only">(required)</span>
		{/if}
	</label>

	{@render children({
		id,
		'aria-describedby': describedBy,
		'aria-invalid': invalid ? 'true' : undefined
	})}

	{#if hint && !invalid}
		<p id={hintId} class="text-xs text-text-muted">{hint}</p>
	{/if}

	{#if issues?.length}
		<!--
			The first issue only. A validation pipe reports every rule that failed, so
			an empty email box returns both "Enter your email address" and "That does
			not look like an email address" — two lines saying one thing, and the
			second is nonsense once you have read the first. Fix what it asks and the
			next problem, if there is one, appears in its place.

			`alert` so the message is announced when it appears after a submit.
		-->
		<p id={errorId} role="alert" class="text-xs text-danger">{issues[0].message}</p>
	{/if}
</div>
