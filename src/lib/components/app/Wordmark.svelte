<script lang="ts">
	import { cn } from '#lib/utils/cn';

	type Props = {
		/** `lg` for a page that is about the brand itself; `md` everywhere else. */
		size?: 'md' | 'lg';
		/** Render as plain text — for the one place that is already inside a link. */
		as?: 'link' | 'text';
		class?: string;
	};

	let { size = 'md', as = 'link', class: className }: Props = $props();

	const SIZES = {
		md: 'text-xl',
		lg: 'text-4xl'
	} as const;

	// Heavier and tighter than a heading. A four-letter wordmark at heading weight
	// reads as a heading that happens to say "Fann"; the extra weight and the
	// negative tracking are what make it a mark.
	const base = $derived(
		cn(
			'inline-block font-display leading-none font-extrabold tracking-[-0.03em] text-text',
			SIZES[size],
			className
		)
	);
</script>

<!--
	The Fann wordmark — the only place `--fann-font-display` is used.

	Mona Sans, the same face as the headings and the body copy. The mark is not a
	different typeface — it is the same one at the top of its weight axis with the
	tracking pulled in, which is what makes it read as a mark rather than as a
	heading that happens to say "Fann".

	`aria-hidden` is deliberately absent — this is the site name and should be read
	as such. The letterforms are decorative; the word is not.
-->
{#if as === 'link'}
	<a href="/" class={base} aria-label="Fann — home">Fann</a>
{:else}
	<span class={base}>Fann</span>
{/if}
