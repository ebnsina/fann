export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface Toast {
	id: string;
	tone: ToastTone;
	title: string;
	description?: string;
	/** Milliseconds until auto-dismiss. `null` keeps it until dismissed. */
	duration: number | null;
	action?: { label: string; onclick: () => void };
}

export interface ToastOptions {
	description?: string;
	duration?: number | null;
	action?: Toast['action'];
}

const DEFAULT_DURATION = 5000;

class ToastState {
	items = $state<Toast[]>([]);
	#timers = new Map<string, ReturnType<typeof setTimeout>>();
	#counter = 0;

	#push(tone: ToastTone, title: string, options: ToastOptions = {}): string {
		const id = `toast-${++this.#counter}`;
		const duration = options.duration === undefined ? DEFAULT_DURATION : options.duration;

		this.items = [...this.items, { id, tone, title, duration, ...options }];

		if (duration !== null) {
			this.#timers.set(
				id,
				setTimeout(() => this.dismiss(id), duration)
			);
		}

		return id;
	}

	/** Errors stay until dismissed — a failure the user missed is a failure repeated. */
	error(title: string, options?: ToastOptions) {
		return this.#push('danger', title, { duration: null, ...options });
	}
	success(title: string, options?: ToastOptions) {
		return this.#push('success', title, options);
	}
	warning(title: string, options?: ToastOptions) {
		return this.#push('warning', title, options);
	}
	info(title: string, options?: ToastOptions) {
		return this.#push('neutral', title, options);
	}

	dismiss(id: string) {
		const timer = this.#timers.get(id);
		if (timer) {
			clearTimeout(timer);
			this.#timers.delete(id);
		}
		this.items = this.items.filter((item) => item.id !== id);
	}

	clear() {
		for (const timer of this.#timers.values()) clearTimeout(timer);
		this.#timers.clear();
		this.items = [];
	}
}

export const toast = new ToastState();
