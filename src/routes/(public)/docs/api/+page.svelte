<script lang="ts">
	import { page } from '$app/state';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Section from '#lib/components/app/marketing/Section.svelte';
	import { icons } from '#lib/design/icons';

	/**
	 * The public API documentation.
	 *
	 * Written against what the endpoints actually do, and kept next to the
	 * marketing pages rather than in a separate docs site — there are four
	 * endpoints, and a page somebody can read in two minutes is worth more than a
	 * generated reference nobody maintains. When an endpoint changes, this changes
	 * in the same commit.
	 */
	const origin = $derived(page.url.origin);

	type Endpoint = {
		method: 'GET' | 'POST';
		path: string;
		summary: string;
		detail: string;
		example: string;
	};

	const ENDPOINTS: Endpoint[] = $derived([
		{
			method: 'GET',
			path: '/api/v1/jobs',
			summary: 'Your jobs',
			detail:
				'Every job belonging to your company, newest first. Takes ?limit= up to 200. Scoped to the key’s own company — there is no parameter that changes whose jobs you get.',
			example: `curl ${origin}/api/v1/jobs \\
  -H "Authorization: Bearer $FANN_KEY"`
		},
		{
			method: 'POST',
			path: '/api/v1/jobs',
			summary: 'Post a job',
			detail:
				'Creates a job and, with "publish": true, puts it on the board. It writes through the same code the form does, so the salary range is required to publish — there is no way in here that skips it. Leave publish off while you are still testing and it stays a draft.',
			example: `curl ${origin}/api/v1/jobs \\
  -H "Authorization: Bearer $FANN_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Backend Engineer",
    "description": "What the work actually is…",
    "employmentType": "full_time",
    "workMode": "remote",
    "experienceLevel": "mid",
    "salaryMin": 90000,
    "salaryMax": 120000,
    "salaryCurrency": "USD",
    "salaryPeriod": "year",
    "publish": true
  }'`
		},
		{
			method: 'GET',
			path: '/api/v1/applications',
			summary: 'Applications you received',
			detail:
				'The same record your board shows: who applied, for what, where it stands. Filter with ?status=. CVs are never returned here — files only leave through a link that re-checks who is asking and whether the file passed its virus scan.',
			example: `curl "${origin}/api/v1/applications?status=submitted" \\
  -H "Authorization: Bearer $FANN_KEY"`
		},
		{
			method: 'POST',
			path: '/api/v1/posts',
			summary: 'Post to the feed',
			detail:
				'Posts as your company, so the same announcement you push to your own site or your social accounts can land here without anyone retyping it. The person who created the key is recorded as the author.',
			example: `curl ${origin}/api/v1/posts \\
  -H "Authorization: Bearer $FANN_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"body": "We just opened a backend role. Salary is on the listing."}'`
		}
	]);

	const WEBHOOK_EXAMPLE = `POST https://your-site.example/fann
fann-event: application.created
fann-timestamp: 1767225600
fann-signature: 9f2c…

{"event":"application.created","data":{"applicationId":"…","jobTitle":"Backend Engineer"}}`;

	const VERIFY_EXAMPLE = `const signed = \`\${req.headers['fann-timestamp']}.\${rawBody}\`;
const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex');

// Compare in constant time, and reject anything older than a few minutes.
crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers['fann-signature']));`;

	let copied = $state<string | null>(null);

	async function copy(text: string, id: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = id;
			setTimeout(() => (copied = null), 1600);
		} catch {
			copied = null;
		}
	}
</script>

<svelte:head>
	<title>API · Fann</title>
	<meta
		name="description"
		content="Post jobs to Fann from your own careers page, read the applications you received, and get a signed webhook when something happens."
	/>
</svelte:head>

<!-- Hero ------------------------------------------------------------------- -->
<Section bordered={false}>
	<div class="flex flex-col gap-6">
		<Badge>
			<Icon icon={icons.launch} class="size-3.5" />
			Free during public beta
		</Badge>

		<h1 class="max-w-3xl text-3xl leading-tight font-bold text-text lg:text-5xl">
			Post your jobs from wherever you already keep them.
		</h1>

		<p class="max-w-2xl text-base text-text-muted lg:text-lg">
			If your openings live on your own careers page, or in a tool you are moving away from, you do
			not have to retype them here. Four endpoints and a signed webhook — that is the whole API.
		</p>

		<div class="flex flex-wrap items-center gap-3">
			<Button href="/hire" variant="primary" size="lg">
				Get a key
				<Icon icon={icons.arrowRight} class="size-4" />
			</Button>
			<Button href="/join/company" variant="secondary" size="lg">Set up a company</Button>
		</div>
	</div>
</Section>

<!-- Authentication --------------------------------------------------------- -->
<Section
	tinted
	eyebrow="Authentication"
	title="One header, one key"
	lead="Create a key on your company's API page. It is shown once — we only keep a hash of it, so if you lose it you revoke it and make another."
>
	<div class="flex flex-col gap-4">
		<pre
			class="overflow-x-auto border border-border bg-surface p-(--fann-space-panel) text-xs text-text-muted">Authorization: Bearer fann_sk_…</pre>

		<div class="grid gap-px border border-border bg-border sm:grid-cols-3">
			{#each [{ title: 'It is the company, not you', body: 'A key belongs to the company, so it keeps working when somebody leaves the team — and stops working when you revoke it, not when they go.' }, { title: 'It cannot read a CV', body: 'Files only ever leave through a link that re-checks who is asking and whether the file passed its virus scan. There is no second door.' }, { title: 'A browser cannot use it', body: 'This API never accepts a session cookie, so no page on the internet can make somebody’s browser read your applications.' }] as note (note.title)}
				<div class="flex flex-col gap-2 bg-surface p-(--fann-space-panel)">
					<h3 class="text-sm font-semibold text-text">{note.title}</h3>
					<p class="text-sm text-text-muted">{note.body}</p>
				</div>
			{/each}
		</div>
	</div>
</Section>

<!-- Endpoints -------------------------------------------------------------- -->
<Section eyebrow="Endpoints" title="All four of them">
	<div class="flex flex-col gap-px border border-border bg-border">
		{#each ENDPOINTS as endpoint (endpoint.method + endpoint.path)}
			<article class="group flex flex-col gap-3 bg-surface p-(--fann-space-panel)">
				<div class="flex flex-wrap items-center gap-3">
					<span
						class="border px-2 py-0.5 font-mono text-2xs font-medium {endpoint.method === 'POST'
							? 'border-accent text-text-accent'
							: 'border-border text-text-muted'}"
					>
						{endpoint.method}
					</span>
					<code class="font-mono text-sm text-text">{endpoint.path}</code>
					<span class="text-sm text-text-muted">{endpoint.summary}</span>

					<Button
						variant="ghost"
						size="xs"
						class="ml-auto"
						onclick={() => copy(endpoint.example, endpoint.path + endpoint.method)}
					>
						{copied === endpoint.path + endpoint.method ? 'Copied' : 'Copy'}
					</Button>
				</div>

				<p class="max-w-3xl text-sm text-text-muted">{endpoint.detail}</p>

				<pre
					class="overflow-x-auto border border-border bg-surface-raised p-4 text-2xs leading-relaxed text-text-muted">{endpoint.example}</pre>
			</article>
		{/each}
	</div>
</Section>

<!-- Webhooks --------------------------------------------------------------- -->
<Section
	tinted
	eyebrow="Webhooks"
	title="We tell you when something happens"
	lead="Add an https endpoint on your API page and pick the events you want. Right now that is a new application, and an application changing status."
>
	<div class="grid gap-4 lg:grid-cols-2">
		<div class="flex flex-col gap-3">
			<h3 class="text-sm font-semibold text-text">What arrives</h3>
			<pre
				class="overflow-x-auto border border-border bg-surface p-4 text-2xs leading-relaxed text-text-muted">{WEBHOOK_EXAMPLE}</pre>
		</div>

		<div class="flex flex-col gap-3">
			<h3 class="text-sm font-semibold text-text">Check the signature</h3>
			<pre
				class="overflow-x-auto border border-border bg-surface p-4 text-2xs leading-relaxed text-text-muted">{VERIFY_EXAMPLE}</pre>
		</div>
	</div>

	<div class="mt-4 grid gap-px border border-border bg-border sm:grid-cols-3">
		{#each [{ title: 'Signed over the timestamp too', body: 'Not the body alone — that would make a delivery somebody captured valid forever. Reject anything with an old timestamp.' }, { title: 'Five tries, then we stop', body: 'A failing endpoint is retried with a growing gap. Retrying a dead one forever is a queue that never drains and a server still being hammered.' }, { title: 'Every attempt is kept', body: 'You can see what we sent and what came back on your API page. "Did you actually send it" should not be a matter of opinion.' }] as note (note.title)}
			<div class="flex flex-col gap-2 bg-surface p-(--fann-space-panel)">
				<h3 class="text-sm font-semibold text-text">{note.title}</h3>
				<p class="text-sm text-text-muted">{note.body}</p>
			</div>
		{/each}
	</div>
</Section>

<!-- Errors ----------------------------------------------------------------- -->
<Section eyebrow="When it goes wrong" title="What comes back">
	<div class="flex flex-col gap-px border border-border bg-border">
		{#each [{ code: '400', meaning: 'Something in the body is wrong. The response names the fields, so you do not have to read a sentence to find out which.' }, { code: '401', meaning: 'Missing, malformed, revoked or unknown key — all one message on purpose, so a reply cannot tell somebody whether a key they guessed exists.' }, { code: '403', meaning: 'The account that created the key has been closed. Issue a new one.' }, { code: '415', meaning: 'Send Content-Type: application/json.' }] as row (row.code)}
			<div class="flex flex-wrap gap-x-6 gap-y-1 bg-surface p-(--fann-space-panel)">
				<code class="w-12 shrink-0 font-mono text-sm text-text" data-numeric>{row.code}</code>
				<p class="min-w-0 flex-1 text-sm text-text-muted">{row.meaning}</p>
			</div>
		{/each}
	</div>

	<p class="mt-4 text-sm text-text-muted">
		Nothing here is versioned away underneath you: if <code class="text-text">/api/v1</code> has to
		change shape, it will be <code class="text-text">/api/v2</code> and this page will say so.
	</p>
</Section>
