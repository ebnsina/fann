import { untrack } from 'svelte';

export interface Shortcut {
	/**
	 * Lowercase `KeyboardEvent.key`, e.g. `k`, `/`, `escape`.
	 *
	 * Pass several when a binding is reachable by more than one key. `?` is the
	 * canonical example: on a US layout it arrives as `?`, but on layouts where
	 * it is a shifted `/` the browser may report `/` instead.
	 */
	key: string | string[];
	/** ⌘ on macOS, Ctrl elsewhere — matched against whichever the platform uses. */
	mod?: boolean;
	/** Only checked when specified. Leave undefined for keys that imply shift. */
	shift?: boolean;
	/** Shown in the `?` shortcut sheet. Omit to keep a binding unlisted. */
	description?: string;
	group?: string;
	run: (event: KeyboardEvent) => void;
	/** Fire even while a text field has focus. Off by default. */
	allowInInput?: boolean;
}

/** True on Apple platforms, where the modifier is ⌘ rather than Ctrl. */
export const isApple =
	typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform ?? '');

/** Render a binding the way this platform's users expect to see it. */
export function formatShortcut(shortcut: Pick<Shortcut, 'key' | 'mod' | 'shift'>): string {
	// The first key is the canonical one; alternates exist for layout coverage,
	// not to be shown to the user.
	const key = Array.isArray(shortcut.key) ? shortcut.key[0] : shortcut.key;

	// A key like `?` already spells out the shift; showing `⇧?` reads as a
	// two-step chord that does not exist.
	const keyImpliesShift = key.length === 1 && !/[a-z0-9]/i.test(key);

	const parts: string[] = [];
	if (shortcut.mod) parts.push(isApple ? '⌘' : 'Ctrl');
	if (shortcut.shift && !keyImpliesShift) parts.push(isApple ? '⇧' : 'Shift');
	parts.push(key.length === 1 ? key.toUpperCase() : key);
	return parts.join(isApple ? '' : '+');
}

function isTextEntry(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tag = target.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

class ShortcutRegistry {
	#shortcuts = $state<Shortcut[]>([]);

	/** Everything registered with a description, for the `?` sheet. */
	get listed(): Shortcut[] {
		return this.#shortcuts.filter((shortcut) => shortcut.description);
	}

	/**
	 * Register for the caller's lifetime. Returns a teardown for `$effect`.
	 *
	 * `untrack` matters here: callers register from inside an `$effect`, and
	 * reading the list to append to it would make that effect depend on state it
	 * just wrote — an infinite update loop.
	 */
	register(...shortcuts: Shortcut[]): () => void {
		untrack(() => {
			this.#shortcuts = [...this.#shortcuts, ...shortcuts];
		});

		return () => {
			untrack(() => {
				this.#shortcuts = this.#shortcuts.filter((existing) => !shortcuts.includes(existing));
			});
		};
	}

	/** Attach to `window`. Called once by the app shell. */
	handle = (event: KeyboardEvent) => {
		if (event.isComposing) return;

		const key = event.key.toLowerCase();
		const mod = isApple ? event.metaKey : event.ctrlKey;

		// Later registrations win, so a dialog's bindings take precedence over the
		// page's without either having to know about the other.
		for (let i = this.#shortcuts.length - 1; i >= 0; i--) {
			const shortcut = this.#shortcuts[i];

			const keys = Array.isArray(shortcut.key) ? shortcut.key : [shortcut.key];
			if (!keys.includes(key)) continue;
			if (Boolean(shortcut.mod) !== mod) continue;
			// Undefined means "don't care" — required so keys that are themselves a
			// shifted character still match on layouts that report the base key.
			if (shortcut.shift !== undefined && shortcut.shift !== event.shiftKey) continue;
			if (!shortcut.allowInInput && isTextEntry(event.target)) continue;

			event.preventDefault();
			shortcut.run(event);
			return;
		}
	};
}

export const shortcuts = new ShortcutRegistry();
