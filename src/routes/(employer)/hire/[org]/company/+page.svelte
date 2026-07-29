<script lang="ts">
	import * as v from 'valibot';
	import Form from '#lib/components/ui/Form.svelte';
	import { page } from '$app/state';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import FormActions from '#lib/components/ui/FormActions.svelte';
	import FormError from '#lib/components/ui/FormError.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Switch from '#lib/components/ui/Switch.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import { toast } from '#lib/components/ui/toast.svelte';
	import { icons } from '#lib/design/icons';
	import { SIZE_OPTIONS, companyProfileSchema } from '#lib/schemas/company';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import { goto } from '$app/navigation';
	import {
		checkDomain,
		claimDomain,
		closeCompany,
		companyClosureImpact,
		companySettings,
		saveCompanyProfile,
		setInteraction,
		verificationState
	} from '../company.remote';

	const orgSlug = $derived(page.params.org ?? '');
	const company = $derived(await companySettings(orgSlug));

	const fields = $derived(saveCompanyProfile.fields.profile);

	let saving = $state(false);

	/**
	 * The size select's own state.
	 *
	 * Writable and seeded from the server. The `Select` below is display only — it
	 * is given no `name`, so submitting the form cannot reset it, and the value is
	 * carried by a hidden input beside it. See the trap in CLAUDE.md.
	 */
	let size = $derived(company?.size ?? '');

	const verification = $derived(await verificationState(orgSlug));
	const impact = $derived(await companyClosureImpact(orgSlug));

	const companyName = $derived(company?.name ?? 'this company');

	let confirmingClose = $state(false);
	let closing = $state(false);

	async function closeThisCompany() {
		closing = true;
		try {
			const result = await closeCompany({ orgSlug });
			// Navigated from here rather than by the command: kit@3 refuses a redirect
			// inside a command *after* the work has committed, so the company would
			// really be closed while this page showed an error.
			await goto('/hire');
			toast.success(
				result.applicationsAnswered > 0
					? `Closed. ${result.applicationsAnswered} ${result.applicationsAnswered === 1 ? 'person was' : 'people were'} told.`
					: 'Closed.'
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not close the company.');
		} finally {
			closing = false;
			confirmingClose = false;
		}
	}

	let domainDraft = $derived(verification.domain ?? '');
	let claiming = $state(false);
	let checking = $state(false);
	let lastCheck = $state<string | null>(null);

	async function claim() {
		claiming = true;
		lastCheck = null;
		try {
			await claimDomain({ orgSlug, domain: domainDraft });
			toast.success('Domain saved. Add the record, then check it.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not save that.');
		} finally {
			claiming = false;
		}
	}

	/** Each failure needs its own words — "not there yet" and "DNS is down" are
	 *  different situations to somebody staring at a spinner. */
	const REASONS: Record<string, string> = {
		'no-domain': 'Add your domain first.',
		'no-records': 'We could not find the record yet. DNS can take a while — try again shortly.',
		'not-found':
			'The record is there but the value does not match. Check you copied the whole thing.',
		'lookup-failed': 'We could not reach DNS for that domain. Try again in a moment.'
	};

	async function check() {
		checking = true;
		lastCheck = null;
		try {
			const outcome = await checkDomain(orgSlug);
			if (outcome.ok) toast.success('Verified. The check now shows on your page.');
			else lastCheck = REASONS[outcome.reason] ?? 'We could not verify that.';
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not check that.');
		} finally {
			checking = false;
		}
	}

	async function change(allows: boolean) {
		saving = true;
		try {
			await setInteraction({ orgSlug, allows });
			toast.success(allows ? 'Replies are on.' : 'Replies are off.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not save that.');
		} finally {
			saving = false;
		}
	}

	// Client-side validation using the same schema the server enforces. The remote
	// takes the profile nested beside the org it belongs to, so preflight has to be
	// given that shape rather than the profile schema on its own.
	saveCompanyProfile.preflight(v.object({ orgSlug: v.string(), profile: companyProfileSchema }));
</script>

<svelte:head><title>Company settings · Fann</title></svelte:head>

<div class="flex flex-col gap-6 p-(--fann-space-page)">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl text-text">Company settings</h1>
		<p class="text-sm text-text-muted">How people can interact with what you publish.</p>
	</div>

	{#if company}
		<Card title="Public profile" description="What a candidate reads before deciding to apply.">
			<Form form={saveCompanyProfile} class="flex flex-col gap-4">
				<FormError issues={saveCompanyProfile.fields.allIssues()} />
				<input {...saveCompanyProfile.fields.orgSlug.as('hidden', orgSlug)} />

				<Field label="Company name" issues={fields.name.issues()} required>
					{#snippet children(control)}
						<Input {...control} {...fields.name.as('text', company.name)} />
					{/snippet}
				</Field>

				<Field
					label="Web address"
					issues={fields.slug.issues()}
					required
					hint="fann.run/companies/{company.slug} — old addresses keep working if you change it."
				>
					{#snippet children(control)}
						<Input {...control} {...fields.slug.as('text', company.slug)} />
					{/snippet}
				</Field>

				<Field label="Tagline" issues={fields.tagline.issues()} hint="One line, under the name.">
					{#snippet children(control)}
						<Input
							{...control}
							{...fields.tagline.as('text', company.tagline ?? '')}
							placeholder="We build things people rely on."
						/>
					{/snippet}
				</Field>

				<Field
					label="About"
					issues={fields.about.issues()}
					hint="Markdown is supported. Say what the company actually does."
				>
					{#snippet children(control)}
						<Textarea {...control} {...fields.about.as('text', company.about ?? '')} rows={6} />
					{/snippet}
				</Field>

				<div class="grid gap-4 sm:grid-cols-3">
					<Field label="Website" issues={fields.websiteUrl.issues()}>
						{#snippet children(control)}
							<Input
								{...control}
								{...fields.websiteUrl.as('url', company.websiteUrl ?? '')}
								placeholder="https://example.com"
							/>
						{/snippet}
					</Field>

					<Field label="Size" issues={fields.size.issues()}>
						{#snippet children(control)}
							<!--
								Display only: no `name`, so a form reset cannot clear it, and the
								value goes up in the hidden input below. Spreading the field here
								instead silently reset the control after every save and wrote a
								null on the next one.
							-->
							<Select {...control} bind:value={size} items={[...SIZE_OPTIONS]} />
							<input type="hidden" name={fields.size.as('select').name} value={size} />
						{/snippet}
					</Field>

					<Field label="Founded" issues={fields.foundedYear.issues()}>
						{#snippet children(control)}
							<Input
								{...control}
								{...fields.foundedYear.as('text', company.foundedYear?.toString() ?? '')}
								placeholder="2019"
							/>
						{/snippet}
					</Field>
				</div>

				<FormActions>
					<Button type="submit" variant="primary">Save</Button>

					{#snippet aside()}
						{#if saveCompanyProfile.result?.saved}
							<span class="flex items-center gap-1.5 text-sm text-success">
								<Icon icon={icons.verified} class="size-4" />
								Saved.
							</span>
						{/if}
					{/snippet}
				</FormActions>
			</Form>
		</Card>

		<Card
			title="Verify your company"
			description="Proves to candidates that this page is really you."
		>
			<div class="flex flex-col gap-4">
				{#if verification.verifiedAt}
					<p
						class="flex items-center gap-2 border border-success/25 bg-success-subtle px-3 py-2 text-sm text-success"
					>
						<Icon icon={icons.verified} class="size-4" />
						<span>
							<span class="font-medium">{verification.domain}</span> is verified. The check shows beside
							your name.
						</span>
					</p>
				{/if}

				<Field label="Your domain" hint="Just the domain — we will tidy up a pasted URL.">
					{#snippet children(control)}
						<div class="flex flex-wrap items-center gap-2">
							<Input
								{...control}
								bind:value={domainDraft}
								placeholder="example.com"
								class="flex-1"
							/>
							<Button variant="secondary" loading={claiming} onclick={claim}>Save domain</Button>
						</div>
					{/snippet}
				</Field>

				{#if verification.recordValue}
					<!--
						The instructions sit next to the thing they describe. Somebody doing
						this has another tab open on their DNS provider, and a link to a help
						page is one more place to lose them.
					-->
					<div class="flex flex-col gap-3 border border-dashed border-border p-3">
						<p class="text-sm text-text-muted">
							Add this TXT record to <span class="text-text">{verification.domain}</span>, then come
							back and check it.
						</p>

						<dl class="flex flex-col gap-2 text-xs">
							<div class="flex flex-wrap items-center gap-2">
								<dt class="w-16 shrink-0 text-text-subtle">Name</dt>
								<dd
									class="min-w-0 flex-1 border border-border bg-surface-sunken px-2 py-1 break-all"
									data-numeric
								>
									{verification.recordName}
								</dd>
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<dt class="w-16 shrink-0 text-text-subtle">Value</dt>
								<dd
									class="min-w-0 flex-1 border border-border bg-surface-sunken px-2 py-1 break-all"
									data-numeric
								>
									{verification.recordValue}
								</dd>
							</div>
						</dl>

						<div class="flex flex-wrap items-center gap-3">
							<Button variant="primary" loading={checking} onclick={check}>Check now</Button>
							{#if lastCheck}
								<span class="text-xs text-warning">{lastCheck}</span>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</Card>

		<Card
			title="Replies to your posts"
			description="Applies to everything {company.name} has posted, not just the next one."
		>
			<div class="flex flex-col gap-4">
				<label class="flex cursor-pointer items-start gap-3">
					<Switch checked={company.allowsInteraction} disabled={saving} onCheckedChange={change} />
					<span class="flex flex-col gap-0.5">
						<span class="text-sm text-text">Let people reply and react</span>
						<span class="text-xs text-text-muted">
							Anyone signed in can comment on your posts and react to them.
						</span>
					</span>
				</label>

				{#if !company.allowsInteraction}
					<!--
						Said plainly, because turning this off is a reasonable choice and the
						page should not imply otherwise — but it does change what a reader
						sees, and they will notice.
					-->
					<p class="border-t border-dashed border-border pt-4 text-xs text-text-muted">
						Replies are off. Your posts still appear in the feed and on your page, and your team can
						still comment. Existing comments stay visible.
					</p>
				{/if}
			</div>
		</Card>

		<Card
			title="Download your company's data"
			description="Everything {company.name} holds, as a file you can keep."
		>
			<div class="flex flex-col gap-4">
				<p class="text-sm text-text-muted">
					Your profile and jobs, every application you received with its timeline, your team's
					private notes and scorecards, interviews and offers. It contains other people's personal
					details, so keep it somewhere you would keep a CV.
				</p>

				<div class="flex flex-wrap items-center gap-3">
					<Button href="/hire/{orgSlug}/company/export" variant="secondary" download>
						<Icon icon={icons.document} class="size-4" />
						Download
					</Button>
					<span class="text-xs text-text-subtle">JSON. Owners only.</span>
				</div>
			</div>
		</Card>

		<!--
			Last on the page, and the only destructive thing on it. Closing is a
			closure rather than a delete: see `organization-account.ts` for why the
			applications have to survive it.
		-->
		<Card title="Close this company" description="This cannot be undone.">
			<div class="flex flex-col gap-4">
				<div class="flex flex-col gap-2 text-sm text-text-muted">
					<p>
						Your jobs come off the board, your company page goes, and everyone on the team loses
						access — including you.
					</p>
					<p>
						Anyone still waiting on you gets a real answer rather than silence, saying the company
						closed its account. Their application and its history stay in their own account, because
						a person's record of their job hunting should not develop a hole when a company leaves.
					</p>
					<p>Your reply times are not erased or reset by this. What happened, happened.</p>
				</div>

				{#if impact.blocker}
					<!--
						Before the button, not after pressing it. Somebody who has an offer
						outstanding should find that out while they are deciding.
					-->
					<p
						class="flex items-start gap-2 border border-warning/25 bg-warning-subtle px-3 py-2 text-sm text-warning"
					>
						<Icon icon={icons.warning} class="mt-px size-4 shrink-0" />
						{impact.blocker}
					</p>
				{:else}
					<div class="flex flex-wrap items-center gap-4 text-sm text-text-muted">
						<span>
							<span class="text-text" data-numeric>{impact.openJobs}</span>
							open {impact.openJobs === 1 ? 'job' : 'jobs'}
						</span>
						<span>
							<span class="text-text" data-numeric>{impact.waitingCandidates}</span>
							{impact.waitingCandidates === 1 ? 'person' : 'people'} waiting on you
						</span>
						<span>
							<span class="text-text" data-numeric>{impact.teamMembers}</span>
							team {impact.teamMembers === 1 ? 'member' : 'members'}
						</span>
					</div>

					<div>
						<Button variant="danger" onclick={() => (confirmingClose = true)}>
							Close {company.name}
						</Button>
					</div>
				{/if}
			</div>
		</Card>
	{/if}
</div>

<ConfirmDialog
	bind:open={confirmingClose}
	title="Close {companyName}?"
	description="Jobs come down, the team loses access, and anyone still waiting is told. This cannot be undone."
	confirmLabel="Close this company"
	confirmPhrase={companyName}
	loading={closing}
	onconfirm={closeThisCompany}
/>
