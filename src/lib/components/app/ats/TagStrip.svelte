<script lang="ts">
	import Badge from '#lib/components/ui/Badge.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { icons } from '#lib/design/icons';

	type Tag = { id: string; name: string };

	type Props = {
		tags: Tag[];
		canEdit: boolean;
		working?: boolean;
		onadd: (name: string) => void;
		onremove: (tagId: string) => void;
	};

	let { tags, canEdit, working = false, onadd, onremove }: Props = $props();

	let draft = $state('');
	let adding = $state(false);

	function submit() {
		const name = draft.trim();
		if (!name) return;
		onadd(name);
		draft = '';
		adding = false;
	}
</script>

<!--
	Tags are the team's own shorthand and the candidate never sees them, which is
	why they sit beside the status rather than inside the timeline — the timeline is
	the shared record, this is the margin note.
-->
<div class="flex flex-wrap items-center gap-2">
	{#each tags as tag (tag.id)}
		<span
			class="inline-flex items-center gap-1.5 border border-border px-2 py-0.5 text-xs text-text-muted"
		>
			<Icon icon={icons.price} class="size-3" />
			{tag.name}
			{#if canEdit}
				<button
					type="button"
					class="text-text-subtle hover:text-danger"
					aria-label="Remove tag {tag.name}"
					disabled={working}
					onclick={() => onremove(tag.id)}
				>
					<Icon icon={icons.close} class="size-3" />
				</button>
			{/if}
		</span>
	{/each}

	{#if canEdit}
		{#if adding}
			<form
				class="flex items-center gap-2"
				onsubmit={(event) => {
					event.preventDefault();
					submit();
				}}
			>
				<Input
					bind:value={draft}
					size="sm"
					class="w-40"
					placeholder="referred, visa…"
					aria-label="New tag"
					onblur={() => {
						if (!draft.trim()) adding = false;
					}}
				/>
			</form>
		{:else}
			<button
				type="button"
				class="inline-flex items-center gap-1.5 border border-dashed border-border px-2 py-0.5 text-xs text-text-subtle hover:border-border-strong hover:text-text"
				onclick={() => (adding = true)}
			>
				<Icon icon={icons.add} class="size-3" />
				Tag
			</button>
		{/if}
	{:else if tags.length === 0}
		<Badge tone="neutral">No tags</Badge>
	{/if}
</div>
