<script lang="ts" module>
	/**
	 * Hugeicons ships React-style camelCase attribute keys (`strokeWidth`), but SVG
	 * needs kebab-case. `key` is a React list hint and has no meaning here.
	 */
	function toSvgAttributes(
		attrs: Readonly<Record<string, string | number>>,
		strokeWidth: number | undefined
	): Record<string, string | number> {
		const out: Record<string, string | number> = {};

		for (const [name, value] of Object.entries(attrs)) {
			if (name === 'key') continue;
			const kebab = name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
			out[kebab] = value;
		}

		if (strokeWidth !== undefined && 'stroke-width' in out) out['stroke-width'] = strokeWidth;
		return out;
	}
</script>

<script lang="ts">
	import type { IconData } from '#lib/design/icons';
	import { cn } from '#lib/utils/cn';

	type Props = {
		icon: IconData;
		class?: string;
		/** Override the icon set's own stroke weight. */
		strokeWidth?: number;
		/**
		 * Only set this when the icon is the *sole* carrier of meaning — an icon-only
		 * button, say. Beside a visible text label it must stay decorative, or screen
		 * readers announce the same thing twice.
		 */
		label?: string;
	};

	let { icon, class: className, strokeWidth, label }: Props = $props();
</script>

<svg
	viewBox="0 0 24 24"
	fill="none"
	class={cn('size-4 shrink-0', className)}
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	{#each icon as [tag, attrs], index (index)}
		<svelte:element this={tag} {...toSvgAttributes(attrs, strokeWidth)} />
	{/each}
</svg>
