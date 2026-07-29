<!--
	A hairline across the top of the window that fills as you read down the page.

	Driven entirely by CSS `scroll()` timeline — no scroll listener, so it cannot
	cost a frame. Browsers without scroll-driven animations show nothing at all
	rather than an empty bar, which is why the track is transparent.
-->
<div
	class="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5"
	aria-hidden="true"
	data-testid="scroll-progress"
>
	<div class="fann-scroll-progress h-full w-full origin-left scale-x-0 bg-accent"></div>
</div>
