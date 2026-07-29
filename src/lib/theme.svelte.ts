export type Theme = 'light' | 'dark' | 'system';

/**
 * Theme preference, stored in a cookie rather than `localStorage`.
 *
 * The difference is *when* the value is readable. `localStorage` exists only in
 * the browser, so the server always rendered light-mode HTML and a blocking
 * inline script had to correct the class before first paint. That works, but:
 *
 *   - the markup the server sends is never the markup that is correct, so
 *     anything decided server-side that depends on the theme — a `theme-color`
 *     meta tag, an OG image — cannot know it; and
 *   - the fix is an inline `<script>`, which a strict Content-Security-Policy has
 *     to be widened or hashed to allow.
 *
 * A cookie arrives with the document request, so `hooks.server.ts` stamps the
 * class straight onto `<html>` and the first byte is already right. The inline
 * script survives only for `system`, which genuinely cannot be resolved on the
 * server — nothing in an HTTP request says what the operating system is set to.
 */
export const THEME_COOKIE = 'fann_theme';

/** A year. The preference is not sensitive, and re-asking every session is rude. */
const MAX_AGE = 60 * 60 * 24 * 365;

/** Anything that is not an explicit choice means "follow the operating system". */
export function parseTheme(value: string | undefined | null): Theme {
	return value === 'light' || value === 'dark' ? value : 'system';
}

/** Guards SSR (no `document`) and browsers that block cookies. */
function readCookie(): Theme {
	try {
		const match = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
		return parseTheme(match?.[1]);
	} catch {
		return 'system';
	}
}

class ThemeState {
	/** The user's stored preference, which may be `system`. */
	preference = $state<Theme>('system');
	/** Tracks the OS setting so `system` stays live without a reload. */
	#systemDark = $state(false);

	/** What is actually rendered right now. */
	get resolved(): 'light' | 'dark' {
		if (this.preference === 'system') return this.#systemDark ? 'dark' : 'light';
		return this.preference;
	}

	/**
	 * Adopt the stored preference and start following the OS. Call once from the
	 * root layout inside `$effect`, which only runs in the browser; the returned
	 * teardown removes the listener.
	 */
	watch(): () => void {
		this.preference = readCookie();

		const query = matchMedia('(prefers-color-scheme: dark)');
		this.#systemDark = query.matches;

		const onChange = (event: MediaQueryListEvent) => {
			this.#systemDark = event.matches;
		};
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	}

	set(theme: Theme) {
		this.preference = theme;

		try {
			// Not `HttpOnly`: the client writes it. Not `Secure` either, or it would
			// stop working over plain HTTP in development — it is a display
			// preference, and there is nothing here worth protecting from a script
			// already running on the page.
			document.cookie =
				theme === 'system'
					? `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`
					: `${THEME_COOKIE}=${theme}; path=/; max-age=${MAX_AGE}; samesite=lax`;
		} catch {
			/* Cookies may be blocked; the in-memory preference still applies. */
		}
	}

	toggle() {
		this.set(this.resolved === 'dark' ? 'light' : 'dark');
	}
}

export const theme = new ThemeState();
