<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import { icons } from '#lib/design/icons';

	type Issue = { message: string; path: Array<string | number> };

	type Props = {
		/** Pass a remote form's `fields.allIssues()` straight through. */
		issues?: Issue[] | undefined;
	};

	let { issues }: Props = $props();

	/*
	 * Only the messages that belong to the form as a whole.
	 *
	 * `allIssues()` returns everything, field problems included, and every field
	 * problem is already printed under the field it belongs to. Listing them again
	 * here is what turned a sign-up form with four empty inputs into ten identical
	 * red lines — the same five messages, twice.
	 *
	 * An issue with an empty `path` is one no field can display: a wrong password, a
	 * combination that is individually valid but jointly wrong. Those have nowhere
	 * else to go, so they surface here and nothing else does.
	 */
	const formLevel = $derived((issues ?? []).filter((issue) => issue.path.length === 0));
</script>

{#if formLevel.length > 0}
	<!-- `alert` so it is announced when it appears after a failed submit. -->
	<div
		role="alert"
		class="flex items-start gap-2.5 border border-danger bg-danger-subtle p-(--fann-space-control) text-sm text-danger"
	>
		<Icon icon={icons.warning} class="mt-px size-4 shrink-0" />
		<div class="flex flex-col gap-1">
			{#each formLevel as issue (issue.message)}
				<p>{issue.message}</p>
			{/each}
		</div>
	</div>
{/if}
