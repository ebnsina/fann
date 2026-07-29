<script lang="ts">
	import { cn } from '#lib/utils/cn';

	type Props = {
		class?: string;
		/**
		 * Match this to the height of the content it stands in for. A skeleton that
		 * is not the same size as the real row causes a layout shift on load, which
		 * is exactly what it exists to prevent.
		 */
		height?: string;
		width?: string;
	};

	let { class: className, height, width }: Props = $props();
</script>

<div
	class={cn('animate-pulse bg-surface-active', className)}
	style:height
	style:width
	aria-hidden="true"
></div>
