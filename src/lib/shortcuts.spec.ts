import { describe, expect, it } from 'vitest';
import { formatShortcut } from './shortcuts.svelte';

describe('formatShortcut', () => {
	it('shows only the canonical key when several are accepted', () => {
		// `/` is an alternate for layouts that report the unshifted key; the user
		// should still be told to press `?`.
		expect(formatShortcut({ key: ['?', '/'], shift: true })).toBe('?');
	});

	it('does not spell out shift for a key that already implies it', () => {
		expect(formatShortcut({ key: '?', shift: true })).toBe('?');
	});

	it('spells out shift for an alphanumeric key', () => {
		expect(formatShortcut({ key: 'n', shift: true })).toMatch(/^(⇧N|Shift\+N)$/);
	});

	it('uppercases single letters and leaves named keys alone', () => {
		expect(formatShortcut({ key: 'k', mod: true })).toMatch(/^(⌘K|Ctrl\+K)$/);
		expect(formatShortcut({ key: 'escape' })).toBe('escape');
	});
});
