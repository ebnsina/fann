<script lang="ts">
	import { cn } from '#lib/utils/cn';

	type Props = {
		/** The finished, formatted string — "178", "$157K", "100%". */
		value: string;
		class?: string;
	};

	let { value, class: className }: Props = $props();

	const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

	/*
	 * An odometer: each digit is a column of 0–9 behind a one-character window,
	 * slid up to the digit it should show.
	 *
	 * It starts *settled*, not at zero. Server-rendered HTML therefore contains the
	 * real number, so the page is correct before any JavaScript runs and correct
	 * forever if none does — a counter that needs to animate before it is right
	 * shows "$000K" to anyone with scripts off.
	 *
	 * It then winds back and rolls forward when it scrolls into view, rather than on
	 * mount: a figure four screens down that finished counting before anyone saw it
	 * has done nothing except cost a frame.
	 */
	let settled = $state(true);
	let host = $state<HTMLElement | null>(null);

	$effect(() => {
		if (!host) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		let frame = 0;

		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				// Once only. Re-rolling every time it scrolls past turns a statistic into
				// a fidget toy.
				observer.disconnect();

				settled = false;
				frame = requestAnimationFrame(() => (settled = true));
			},
			{ rootMargin: '0px 0px -10% 0px' }
		);

		observer.observe(host);

		return () => {
			observer.disconnect();
			cancelAnimationFrame(frame);
		};
	});

	const characters = $derived([...value]);
</script>

<!--
	`aria-label` carries the number and the reels are hidden: without it a screen
	reader reads "0 1 2 3 4 5 6 7 8 9" once per digit.
-->
<span
	bind:this={host}
	class={cn('inline-flex items-baseline', className)}
	aria-label={value}
	data-numeric
>
	{#each characters as character, index (index)}
		{#if character >= '0' && character <= '9'}
			<span class="inline-block h-[1em] overflow-hidden leading-none" aria-hidden="true">
				<!--
					`transform` and `transition-delay` are inline because they are the
					datum: which digit this reel stops on, and how far into the cascade it
					is. There is no class that can say "stop on the 7".
				-->
				<span
					class="flex flex-col transition-transform duration-700 ease-(--ease-out)"
					style:transform="translateY(-{settled ? Number(character) : 0}em)"
					style:transition-delay="{index * 60}ms"
				>
					{#each DIGITS as digit (digit)}
						<span class="h-[1em] leading-none">{digit}</span>
					{/each}
				</span>
			</span>
		{:else}
			<span aria-hidden="true">{character}</span>
		{/if}
	{/each}
</span>
