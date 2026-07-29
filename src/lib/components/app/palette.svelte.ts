/**
 * Open state for the command palette.
 *
 * Module-level rather than a prop because the palette is opened from unrelated
 * places — the ⌘K binding, the top-bar search button, empty states offering
 * "find a job" — and threading a callback through all of them would be noise.
 */
class PaletteState {
	open = $state(false);

	show() {
		this.open = true;
	}

	toggle() {
		this.open = !this.open;
	}
}

export const palette = new PaletteState();
