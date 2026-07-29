import { render } from 'vitest-browser-svelte';
import { describe, expect, it } from 'vitest';
import Form from './FormHarness.svelte';

/**
 * One assertion, and it guards a bug that cost a long afternoon.
 *
 * The browser runs its own constraint validation before dispatching `submit`. An
 * `<input type="email">` holding something that is not an email fails it, and when
 * it fails **no submit event is dispatched at all** — so Kit's handler never runs,
 * the preflight schema is never checked, and no issue is ever displayed. Pressing
 * the button does nothing, silently, with no message anywhere.
 *
 * That looked exactly like a broken `form.preflight()` and was recorded as one for
 * a while. It is not: preflight works the moment the native layer stops
 * intercepting. `novalidate` is what makes the Valibot schema the only thing
 * deciding whether a form may be submitted.
 */
describe('Form', () => {
	it('renders novalidate, without which nothing submits and nothing says why', async () => {
		const screen = render(Form);

		const element = screen.container.querySelector('form');

		expect(element).not.toBeNull();
		expect(element?.hasAttribute('novalidate')).toBe(true);
	});
});
