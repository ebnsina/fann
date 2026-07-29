<script lang="ts">
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import VerifiedMark from './VerifiedMark.svelte';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Markdown from '#lib/components/ui/Markdown.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import { toast } from '#lib/components/ui/toast.svelte';
	import { icons } from '#lib/design/icons';
	import { formatRelativeTime } from '#lib/utils/format';
	import {
		addComment,
		canModerate,
		comments as commentsFor,
		hideComment,
		removeComment,
		removePost,
		reportContent,
		toggleLike
	} from '../../../routes/(public)/feed/feed.remote';

	type Post = {
		id: string;
		body: string;
		createdAt: Date;
		authorName: string;
		companyName: string | null;
		companySlug: string | null;
		likes: number;
		comments: number;
		likedByViewer: boolean;
		ownedByViewer: boolean;
		interactionsAllowed: boolean;
		/** Set when the company behind the post proved it owns its domain. */
		companyVerified?: boolean;
	};

	type Props = { post: Post; signedIn: boolean; viewerName?: string };
	let { post, signedIn, viewerName = 'You' }: Props = $props();

	let open = $state(false);
	let draft = $state('');
	let busy = $state(false);
	let confirmingDelete = $state(false);

	/** Comments are fetched only when somebody opens them — most rows are scrolled past. */
	const thread = $derived(open ? await commentsFor(post.id) : []);

	/**
	 * Whether the viewer runs this thread — the company that published the post, or
	 * platform staff. Asked only once the thread is open, since it is a query per
	 * post and most rows are never expanded.
	 */
	const moderates = $derived(open && signedIn ? await canModerate(post.id) : false);

	/** Replies need an account and the company's permission. */
	const canInteract = $derived(signedIn && post.interactionsAllowed);

	/**
	 * The like, applied before the server has answered.
	 *
	 * A heart that waits 300ms to fill reads as a button that did not work, and
	 * people press it again. These are the local overrides; they are cleared once
	 * the refreshed post arrives, and put back if the call fails.
	 */
	let likedOverride = $state<boolean | null>(null);
	let likeDelta = $state(0);
	let popping = $state(false);

	const liked = $derived(likedOverride ?? post.likedByViewer);
	const likeCount = $derived(post.likes + likeDelta);

	async function like() {
		if (!canInteract) return;

		const next = !liked;
		likedOverride = next;
		likeDelta = next ? 1 : -1;
		popping = next;

		try {
			await toggleLike(post.id);
			// The refreshed row now carries the truth; drop the override so the two
			// cannot disagree.
			likedOverride = null;
			likeDelta = 0;
		} catch (error) {
			likedOverride = null;
			likeDelta = 0;
			toast.error(error instanceof Error ? error.message : 'Could not do that.');
		} finally {
			setTimeout(() => (popping = false), 400);
		}
	}

	async function send() {
		if (!draft.trim()) return;
		busy = true;
		try {
			await addComment({ postId: post.id, body: draft });
			draft = '';
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not post that.');
		} finally {
			busy = false;
		}
	}

	async function flag() {
		try {
			const result = await reportContent({ postId: post.id, reason: '' });
			toast.success(
				result.hidden
					? 'Reported. It has been hidden while somebody looks at it.'
					: 'Reported. Thank you.'
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not report that.');
		}
	}
</script>

<article
	class="flex flex-col gap-3 bg-surface p-(--fann-space-panel) transition-colors duration-(--fann-duration-fast) hover:bg-surface-hover/40"
>
	<header class="flex items-start justify-between gap-3">
		<div class="flex min-w-0 items-center gap-3">
			<Avatar name={post.companyName ?? post.authorName} size="lg" />

			<div class="flex min-w-0 flex-col gap-0.5">
				<p class="flex min-w-0 items-center gap-1.5 text-sm font-medium text-text">
					{#if post.companyName}
						{#if post.companyVerified}
							<VerifiedMark />
						{/if}
						<!-- The company leads, and the person who wrote it is named after it —
						     a post that speaks for a company is still written by somebody. -->
						<a href="/companies/{post.companySlug}" class="truncate hover:text-text-accent">
							{post.companyName}
						</a>
						<span class="truncate font-normal text-text-subtle">· {post.authorName}</span>
					{:else}
						<span class="truncate">{post.authorName}</span>
					{/if}
				</p>
				<time class="text-xs text-text-subtle">{formatRelativeTime(post.createdAt)}</time>
			</div>
		</div>

		<div class="flex shrink-0 items-center gap-1">
			{#if post.ownedByViewer}
				<Button size="xs" variant="ghost" onclick={() => (confirmingDelete = true)}>Remove</Button>
			{:else if signedIn}
				<Button size="xs" variant="ghost" onclick={flag} title="Report this post">Report</Button>
			{/if}
		</div>
	</header>

	<!--
		Through the shared sanitizer, like every other piece of text a stranger
		wrote. This is the only safe way to render it.
	-->
	<Markdown source={post.body} />

	<div class="flex flex-wrap items-center gap-3 border-t border-dashed border-border pt-3 text-xs">
		<button
			type="button"
			onclick={like}
			disabled={!canInteract}
			aria-pressed={liked}
			aria-label={liked ? 'Remove your reaction' : 'React to this post'}
			class="flex items-center gap-1.5 text-text-subtle transition-colors enabled:hover:text-text-accent disabled:opacity-60"
		>
			<Icon
				icon={icons.trust}
				class="size-3.5 transition-colors {liked ? 'text-text-accent' : ''} {popping
					? 'fann-pop'
					: ''}"
			/>
			<span data-numeric>{likeCount}</span>
		</button>

		<button
			type="button"
			onclick={() => (open = !open)}
			class="flex items-center gap-1.5 text-text-subtle hover:text-text"
		>
			<Icon icon={icons.message} class="size-3.5" />
			<span data-numeric>{post.comments}</span>
			{post.comments === 1 ? 'reply' : 'replies'}
		</button>

		{#if !post.interactionsAllowed}
			<!--
				Said rather than left as a dead button. A control that silently does
				nothing reads as broken; a company choosing not to take replies is a
				normal choice and worth stating as one.
			-->
			<span class="text-text-subtle">· {post.companyName} has replies turned off</span>
		{/if}
	</div>

	{#if open}
		<div class="flex flex-col gap-3 border-t border-dashed border-border pt-3">
			{#each thread as comment (comment.id)}
				<div class="fann-enter flex gap-2.5">
					<Avatar name={comment.authorName} size="sm" class="mt-0.5" />
					<div class="flex min-w-0 flex-1 flex-col gap-0.5">
						<p class="flex flex-wrap items-center gap-2 text-xs">
							<span class="font-medium text-text">{comment.authorName}</span>
							<span class="text-text-subtle">{formatRelativeTime(comment.createdAt)}</span>
							{#if moderates && !comment.ownedByViewer}
								<!--
								Hiding, not deleting. The reply stays and its author is unchanged,
								so this can be undone and can be shown to have been wrong.
							-->
								<button
									type="button"
									class="text-text-subtle hover:text-warning"
									onclick={async () => {
										try {
											await hideComment({ commentId: comment.id, postId: post.id, hidden: true });
											toast.success('Hidden from the thread.');
										} catch (error) {
											toast.error(error instanceof Error ? error.message : 'Could not hide that.');
										}
									}}
								>
									Hide
								</button>
							{/if}
							{#if comment.ownedByViewer}
								<button
									type="button"
									class="text-text-subtle hover:text-danger"
									onclick={async () => {
										try {
											await removeComment({ commentId: comment.id, postId: post.id });
										} catch (error) {
											toast.error(
												error instanceof Error ? error.message : 'Could not remove that.'
											);
										}
									}}
								>
									Remove
								</button>
							{/if}
						</p>
						<p class="text-sm break-words text-text-muted">{comment.body}</p>
					</div>
				</div>
			{/each}

			{#if thread.length === 0}
				<p class="text-xs text-text-subtle">No replies yet.</p>
			{/if}

			{#if canInteract}
				<div class="flex gap-2.5">
					<Avatar name={viewerName} size="sm" class="mt-0.5" />
					<div class="flex min-w-0 flex-1 flex-col gap-2">
						<Textarea
							bind:value={draft}
							rows={2}
							placeholder="Write a reply"
							onkeydown={(event: KeyboardEvent) => {
								// The shortcut every feed has. Enter alone inserts a newline,
								// because a reply is prose and not a search box.
								if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
									event.preventDefault();
									send();
								}
							}}
						/>
						<div class="flex items-center justify-end gap-3">
							<span class="text-2xs text-text-subtle">⌘↵ to send</span>
							<Button size="xs" variant="primary" loading={busy} onclick={send}>Reply</Button>
						</div>
					</div>
				</div>
			{:else if !signedIn}
				<p class="text-xs text-text-subtle">
					<a href="/login" class="text-text-accent underline-offset-2 hover:underline">Sign in</a>
					to reply.
				</p>
			{/if}
		</div>
	{/if}
</article>

<ConfirmDialog
	bind:open={confirmingDelete}
	title="Remove this post?"
	description="It disappears from the feed and from your page."
	detail="Replies to it go with it. This cannot be undone."
	confirmLabel="Remove"
	onconfirm={async () => {
		confirmingDelete = false;
		try {
			await removePost(post.id);
			toast.success('Removed.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not remove that.');
		}
	}}
	oncancel={() => (confirmingDelete = false)}
/>
