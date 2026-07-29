<script lang="ts">
	import Form from '#lib/components/ui/Form.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import FormActions from '#lib/components/ui/FormActions.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import { toast } from '#lib/components/ui/toast.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime } from '#lib/utils/format';
	import { myResumes } from '../../applications.remote';
	import { deleteResume, uploadResume } from '../../documents.remote';

	const documents = $derived(await myResumes());
	const fields = $derived(uploadResume.fields);

	let pendingDelete = $state<{ id: string; label: string } | null>(null);
	let removing = $state(false);

	// `Intl.NumberFormat` rather than a hand-rolled divide: it gets the units, the
	// rounding and the locale's separators right without any of it living here.
	const size = new Intl.NumberFormat(undefined, {
		style: 'unit',
		unit: 'megabyte',
		maximumFractionDigits: 1
	});

	async function remove() {
		if (!pendingDelete) return;
		removing = true;
		try {
			await deleteResume(pendingDelete.id);
			toast.success(`Removed ${pendingDelete.label}.`);
			pendingDelete = null;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not remove that file.');
		} finally {
			removing = false;
		}
	}
</script>

<svelte:head><title>Your CVs · Fann</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl text-text">Your CVs</h1>
		<p class="text-sm text-text-muted">
			Upload once and pick one when you apply. Only companies you apply to can open them.
		</p>
	</div>

	<Card title="Add a CV" description="PDF, Word or plain text, up to 10 MB.">
		<Form form={uploadResume} class="flex flex-col gap-4">
			<FormError issues={fields.allIssues()} />

			<Field label="File" issues={fields.file.issues()} required>
				{#snippet children(control)}
					<Input {...control} {...fields.file.as('file')} accept=".pdf,.doc,.docx,.txt" />
				{/snippet}
			</Field>

			<Field
				label="Name it"
				issues={fields.label.issues()}
				hint="Optional. Helps when you keep more than one — “Backend roles”, say."
			>
				{#snippet children(control)}
					<Input {...control} {...fields.label.as('text')} placeholder="Backend roles" />
				{/snippet}
			</Field>

			<FormActions>
				<Button type="submit" variant="primary">
					<Icon icon={icons.upload} class="size-4" />
					Upload
				</Button>
			</FormActions>
		</Form>
	</Card>

	{#if documents.length === 0}
		<EmptyState
			title="No CVs yet"
			description="Upload one above and it will be ready when you apply."
		>
			{#snippet icon()}<Icon icon={icons.document} class="size-6" />{/snippet}
		</EmptyState>
	{:else}
		<div class="border border-border">
			{#each documents as document (document.id)}
				<div
					class="flex flex-wrap items-center gap-4 border-b border-border bg-surface p-(--fann-space-panel) last:border-b-0"
				>
					<Icon icon={icons.document} class="size-5 shrink-0 text-text-subtle" />

					<div class="flex min-w-0 flex-1 flex-col gap-0.5">
						<p class="truncate text-sm font-medium text-text">{document.label}</p>
						<p class="flex flex-wrap items-center gap-2 text-xs text-text-subtle">
							<span class="truncate">{document.originalName}</span>
							<span aria-hidden="true">·</span>
							<span data-numeric>{size.format(document.sizeBytes / 1_000_000)}</span>
							<span aria-hidden="true">·</span>
							<span>Added {formatRelativeTime(document.createdAt)}</span>
						</p>
					</div>

					<div class="flex shrink-0 items-center gap-1">
						<!--
							The download goes through /files/[id], which re-checks who is asking
							on every request rather than trusting a signed link.
						-->
						<Button size="xs" variant="ghost" href="/files/{document.id}">Open</Button>
						<Button
							size="xs"
							variant="ghost"
							onclick={() => (pendingDelete = { id: document.id, label: document.label })}
						>
							Remove
						</Button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<ConfirmDialog
	open={pendingDelete !== null}
	title="Remove this CV?"
	description="{pendingDelete?.label ?? ''} will be deleted from your account."
	detail="If you have applied for a job with it, we will keep it instead — an employer part-way through reading your application should not find it gone."
	confirmLabel="Remove"
	loading={removing}
	onconfirm={remove}
	oncancel={() => (pendingDelete = null)}
/>
