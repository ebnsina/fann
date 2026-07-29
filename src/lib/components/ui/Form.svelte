<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils/cn';

	/**
	 * Every `<form>` in this product.
	 *
	 * It exists for one attribute — `novalidate` — and that attribute is the whole
	 * reason client-side validation works here at all.
	 *
	 * The browser runs its own constraint validation before it fires a `submit`
	 * event, and an `<input type="email">` holding `not-an-email` fails it. When it
	 * fails, **no submit event is dispatched**, so Kit's handler never runs, the
	 * preflight schema is never checked, and `issues()` stays empty. The form simply
	 * does nothing when you press the button, with no message anywhere explaining
	 * why. That was diagnosed for a long time as a bug in `form.preflight()`; it is
	 * not, and preflight works correctly the moment the browser stops intercepting.
	 *
	 * `novalidate` turns the native layer off so there is exactly **one** validation
	 * story: the Valibot schema, checked in the browser by preflight and again on
	 * the server. That matters beyond the bug — the native bubbles cannot be styled,
	 * are not announced consistently, disappear on their own, and word things
	 * differently from every message we write.
	 *
	 * Take the attribute away and forms silently stop submitting again. There is a
	 * test asserting it is present.
	 */
	type Props = {
		/** The remote form object. Spread whole, so its attachment is preserved. */
		form: Record<string, unknown>;
		/** Required when the form carries a file input. */
		enctype?: 'multipart/form-data';
		class?: string;
		children: Snippet;
	};

	let { form, enctype, class: className, children }: Props = $props();
</script>

<form {...form} novalidate {enctype} class={cn('flex flex-col gap-4', className)}>
	{@render children()}
</form>
