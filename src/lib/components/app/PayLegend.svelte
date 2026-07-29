<script lang="ts">
	/**
	 * What the marks on a pay bar mean, shown rather than described.
	 *
	 * These bars used to be explained by a sentence underneath — "the bar is the
	 * range from the lowest tenth to the highest tenth; the solid block is the
	 * middle half, and the line is the middle". That is three shapes described in
	 * words, in the order somebody has to hold in their head while looking back up
	 * at a chart. Drawing the shapes next to their names removes the translation
	 * step, and it is the same key everywhere a bar appears, so the reader learns
	 * it once.
	 *
	 * Wording is deliberately non-statistical: "most jobs pay" rather than
	 * "interquartile range". The figures are for people choosing what to apply for.
	 */
</script>

<ul class="flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs text-text-subtle">
	<li class="flex items-center gap-1.5">
		<span aria-hidden="true" class="h-1 w-5 shrink-0 bg-border-strong"></span>
		Lowest to highest paid
	</li>
	<li class="flex items-center gap-1.5">
		<span aria-hidden="true" class="h-2 w-5 shrink-0 bg-accent-subtle"></span>
		Where most jobs pay
	</li>
	<li class="flex items-center gap-1.5">
		<span aria-hidden="true" class="h-3 w-0.5 shrink-0 bg-accent"></span>
		Middle of the market
	</li>
</ul>
