<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PostCard from '#lib/components/app/PostCard.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import FormActions from '#lib/components/ui/FormActions.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import { icons } from '#lib/design/icons';
	import { currentUser } from '../../(auth)/auth.remote';
	import { createPost, posts, postingIdentities } from './feed.remote';

	const user = $derived(await currentUser());
	const signedIn = $derived(Boolean(user));

	const followingOnly = $derived(page.url.searchParams.get('view') === 'following');
	// The argument shape must match what the mutations refresh — see FEED_VIEWS.
	const feed = $derived(await posts({ followingOnly, before: '' }));
	const identities = $derived(await postingIdentities());

	const fields = $derived(createPost.fields);

	const identityItems = $derived([
		{ value: '', label: user ? `As ${user.name}` : 'As yourself' },
		...identities.map((row) => ({ value: row.id, label: `As ${row.name}` }))
	]);

	/** `page.url` is readonly, so it is copied through its string form. */
	function setView(view: string) {
		const url = new URL(page.url.href);
		if (view) url.searchParams.set('view', view);
		else url.searchParams.delete('view');
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>Feed · Fann</title>
	<meta
		name="description"
		content="What companies and people hiring on Fann are saying. Follow a company to see its updates."
	/>
</svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-6 px-(--fann-space-page) py-12">
	<div class="flex flex-col gap-2">
		<h1 class="text-3xl text-text">Feed</h1>
		<p class="text-base text-text-muted">
			What companies and people here are saying. Follow a company from its page to see its updates.
		</p>
	</div>

	{#if signedIn}
		<Card
			title="Post something"
			description="Anyone can read this, including people you work with."
		>
			<form {...createPost} class="flex flex-col gap-4">
				<FormError issues={fields.allIssues()} />

				<Field label="Your post" issues={fields.body.issues()} hint="Markdown is supported.">
					{#snippet children(control)}
						<Textarea
							{...control}
							{...fields.body.as('text')}
							rows={3}
							placeholder="Something worth saying"
						/>
					{/snippet}
				</Field>

				{#if identities.length > 0}
					<!--
						Only shown to somebody who actually belongs to a company. For everyone
						else there is nothing to choose between.
					-->
					<Field label="Post as" issues={fields.companyId.issues()}>
						{#snippet children(control)}
							<Select {...control} {...fields.companyId.as('select')} items={identityItems} />
						{/snippet}
					</Field>
				{/if}

				<FormActions>
					<Button type="submit" variant="primary">Post</Button>
				</FormActions>
			</form>
		</Card>
	{/if}

	<div class="flex w-fit gap-px border border-border bg-border">
		{#each [{ value: '', text: 'Everything' }, { value: 'following', text: 'Who you follow' }] as tab (tab.value)}
			<button
				type="button"
				onclick={() => setView(tab.value)}
				aria-pressed={(tab.value === 'following') === followingOnly}
				class="px-4 py-2 text-sm transition-colors {(tab.value === 'following') === followingOnly
					? 'bg-surface-raised font-medium text-text'
					: 'bg-surface text-text-muted hover:bg-surface-hover hover:text-text'}"
			>
				{tab.text}
			</button>
		{/each}
	</div>

	{#if feed.length === 0}
		<EmptyState
			title={followingOnly ? 'Nothing from anyone you follow' : 'Nothing here yet'}
			description={followingOnly
				? 'Follow a company from its page and its updates will appear here.'
				: 'When companies and people start posting, it will show up here.'}
		>
			{#snippet icon()}<Icon icon={icons.message} class="size-6" />{/snippet}
			{#snippet action()}
				<Button href="/companies" size="sm">Find companies to follow</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="flex flex-col gap-px border border-border bg-border">
			{#each feed as post (post.id)}
				<div class="fann-enter">
					<PostCard {post} {signedIn} viewerName={user?.name ?? 'You'} />
				</div>
			{/each}
		</div>
	{/if}
</div>
