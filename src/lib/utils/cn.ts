import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The type scale adds `2xs` and re-points the default steps, so tailwind-merge
 * has to be told about it or `text-2xs` and `text-sm` stop cancelling each other.
 */
const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			'font-size': [{ text: ['2xs', 'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'] }]
		}
	}
});

/** Merge class lists so a caller's `class` prop always wins over a component default. */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
