<script lang="ts">
	import { icons } from '#lib/design/icons';
	import Icon from './Icon.svelte';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { toast, type ToastTone } from './toast.svelte';

	const TONES: Record<ToastTone, string> = {
		neutral: 'border-border',
		success: 'border-l-success border-l-2',
		warning: 'border-l-warning border-l-2',
		danger: 'border-l-danger border-l-2'
	};
</script>

<!--
	`polite` rather than `assertive`: toasts report the outcome of something the
	user just did, so interrupting their current context is the wrong trade.
-->
<div
	class="pointer-events-none fixed right-0 bottom-0 z-100 flex w-full max-w-sm flex-col gap-3 p-(--fann-space-page)"
	role="region"
	aria-label="Notifications"
>
	{#each toast.items as item (item.id)}
		<div
			animate:flip={{ duration: 140 }}
			in:fly={{ y: 8, duration: 140 }}
			out:fly={{ x: 16, duration: 100 }}
			role="status"
			aria-live="polite"
			class="pointer-events-auto flex items-start gap-4 border border-border bg-surface-overlay p-4 shadow-overlay {TONES[
				item.tone
			]}"
		>
			<div class="flex min-w-0 flex-1 flex-col gap-0.5">
				<p class="text-sm font-medium text-text">{item.title}</p>
				{#if item.description}
					<p class="text-xs text-text-muted">{item.description}</p>
				{/if}
				{#if item.action}
					<button
						type="button"
						class="mt-1 self-start text-xs font-medium text-text-accent underline-offset-2 hover:underline"
						onclick={() => {
							item.action?.onclick();
							toast.dismiss(item.id);
						}}
					>
						{item.action.label}
					</button>
				{/if}
			</div>

			<button
				type="button"
				class="-mt-0.5 -mr-0.5 inline-flex size-5 shrink-0 items-center justify-center text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
				onclick={() => toast.dismiss(item.id)}
				aria-label="Dismiss notification"
			>
				<Icon icon={icons.close} class="size-3.5" />
			</button>
		</div>
	{/each}
</div>
