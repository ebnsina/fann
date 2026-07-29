> Working rules for this repo — commit identity, code standards, wording, visuals —
> live in **`GUIDELINES.md`**. This file describes how the codebase itself works.

## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: prettier, eslint, vitest, playwright, tailwindcss, sveltekit-adapter, drizzle, mcp, experimental

## SvelteKit 3 (next) conventions — these differ from the stable docs

The MCP/Svelte docs describe SvelteKit 2. This project runs `@sveltejs/kit@3.0.0-next`,
where several things have changed. Follow these, not the docs:

- **`$lib` is removed.** Use Node subpath imports: `#lib/...`, declared in
  `package.json` → `imports`. `kit.files.lib` no longer exists.
- **`$app/environment` is gone.** Guard browser-only APIs with a `try/catch` or a
  `typeof` check, or rely on `$effect` (which only runs client-side).
- **`defineEnvVars` is imported from `@sveltejs/kit/env`** (not `/hooks`), and each
  variable takes `{ description, schema }` where `schema` is a Standard Schema.
  Defaults come from the schema: `v.optional(v.string(), 'fallback')`. There is no
  `default` key. All env vars live in `src/env.ts`; read them from `$app/env/private`.
- **`kit.typescript.config` is removed**, as is `kit.experimental.handleRenderingErrors`.
  `tsconfig.json` must use `"extends": "$app/tsconfig"` with `"include": ["src", ...]`.

## Architecture

The implementation plan lives at `~/.claude/plans/plan-for-complete-comprehensive-virtual-snowglobe.md`.

- **Remote functions (`*.remote.ts`) are the data layer** — not `+page.server.ts` load
  functions. `query` reads, `form`/`command` mutate, `query.batch` for lists,
  `query.live` for the pipeline board. Remote functions validate input with Valibot,
  check authorization, and then call a service; they hold no business logic.
- **Services in `src/lib/server/services/` own business logic and DB access**, so ATS
  logic is testable in Node without a browser.
- Remote functions are reachable as raw HTTP endpoints. **Never rely on route-group
  nesting for authorization** — check permissions inside every one.
- **Schema is split by domain** under `src/lib/server/db/schema/`, re-exported from
  `index.ts`. Use the column helpers in `_shared.ts` rather than redeclaring
  `id`/`createdAt`/`updatedAt`.
- Postgres extensions are not part of the migration graph. Run `pnpm db:setup`
  (extensions, then migrate) rather than `db:migrate` alone.
- **The connection pool is cached on `globalThis` in development.** Vite replaces
  `db/index.ts` whenever anything it imports changes, and without the cache each
  reload built a new pool and abandoned the old one — the sockets stay open,
  Postgres keeps the backends, and after an afternoon's editing everything fails
  with `53300: sorry, too many clients already`. It presents as unrelated query
  errors in whatever ran next, usually the tests, so it reads as flake rather than
  as a leak. If you see `53300`, check `pg_stat_activity` before suspecting a
  test.

### Known traps (each cost real debugging time)

- **Never interpolate a JS `Date` into a Drizzle `sql` template.** It bypasses the
  column's type mapping and reaches postgres.js unserialized, failing with
  `The "string" argument must be of type string… Received an instance of Date`.
  Compute time in SQL (`now() - make_interval(secs => …)`) — which also removes
  app/DB clock skew.
- **Never call a remote `command` inside a tracked `$effect`.** The call registers a
  dependency on the command's own state, so the effect re-runs and hammers the
  endpoint forever. Wrap in `untrack()` plus a ran-once guard (see
  `routes/(auth)/verify/+page.svelte`).
- **Every `<form>` needs `novalidate`** — which is why every form goes through
  `Form.svelte` rather than a bare element. The browser runs its own constraint
  validation _before_ dispatching `submit`, and an `<input type="email">` holding
  something that is not an email fails it. When it fails **no submit event is
  dispatched at all**, so Kit's handler never runs, the preflight schema is never
  checked, and no issue is ever shown. The button does nothing, silently.

  This was recorded here for a while as "`form.preflight()` is broken in
  kit@3.0.0-next.12, it throws `state_unsafe_mutation` from the focusout handler".
  That was wrong on both counts: nothing throws, and preflight works correctly the
  moment the native layer stops intercepting. The misdiagnosis survived because the
  bare form used to test it typed its email field as `text`, which has no native
  validation to trip over. `Form.svelte.spec.ts` fails if the attribute goes.

- **`query(...).refresh()` is keyed by its argument.** `posts()` and
  `posts({ followingOnly: false, before: '' })` are different cache entries, so a
  mutation that refreshed the bare call left the page rendering stale data — likes
  reverted, new posts did not appear, and it looked like the write had failed. The
  feed's mutations refresh through `FEED_VIEWS`, which lists the exact argument
  shapes the page asks for.
- **`redirect()` inside a remote `command` is refused at runtime** — "Redirects are
  not allowed in commands. Return a result instead and use goto on the client."
  The throw happens _after_ the command's work, so the effect is worse than a
  plain failure: the mutation commits, the page stays put, and the user sees an
  error for something that succeeded. Found on account deletion, where the account
  really was closed while the settings page showed a red toast. Return a value and
  call `goto()` in the caller.
- **Never spread a remote form field onto `Select`.** `{...fields.x.as('select', initial)}`
  gives the component a `name`, which makes bits-ui render a form control — and
  submitting the form resets it to empty. The control then sits blank while the
  database still holds the real value, and the _next_ save writes the blank. It
  cost real data on the company settings page (`size` silently became null) and
  was latent on `JobForm`, where the fields are required so the second save failed
  validation instead. Bind `Select` to local state, give it **no** `name`, and
  carry the value in a plain `<input type="hidden" name={fields.x.as('select').name}>`
  beside it. A writable `$derived` does not rescue this: the binding writes the
  empty value back, and with no dependency change the derived never recomputes.
- **A scroll container must be `position: relative`.** Tailwind's `sr-only` is
  `position: absolute`, and an absolutely positioned descendant with no positioned
  ancestor inside the scroller resolves against `<body>` instead — escaping the
  clip and landing at whatever document offset it had scrolled to. In `AppShell`
  that grew the page by ~700px, so the _window_ scrolled and took the fixed
  sidebar and topbar with it. The symptom looks like a broken layout; the cause is
  one visually hidden span. Both scrollers there carry `relative` for this reason.
- Don't name a variable `state` in a `.svelte` file — it shadows the `$state` rune.
- **A literal `</` + `script>` anywhere in a `.svelte` file — including inside a
  comment or a template literal — terminates the block** for the Svelte compiler
  _and_ the ESLint parser. Escape it (`<\/script>`) and disable `no-useless-escape`,
  or reword the comment.
- **Regex literals containing `/>`** (e.g. `.replace(/>/g, …)`) trip the Svelte
  template parser. Use `replaceAll` with plain strings.
- **`db.execute` returns raw driver rows** — no column mapping, so timestamps come
  back as strings, not `Date`. Coerce at the boundary.
- **Never pass a JS array to `= any($1)`** in raw SQL; bind each element as its own
  parameter (`in (${sql.join(...)})`), or Postgres fails to parse it as an array.
- **A backtick anywhere inside a `sql` template — including in a SQL comment —
  terminates the template literal**, producing a cascade of unrelated syntax
  errors several lines later. Same family as the closing-script-tag trap below:
  do not quote an identifier with backticks in a comment.
- Serializing JSON into a `<script type="application/ld+json">` block must escape
  `<` and `>` — `JSON.stringify` does not, and user content containing a closing
  script tag would otherwise break out into markup.

## Company profiles

`services/company.ts`. Until this existed the row was written once inside
`organization.ts` at sign-up and never touched again, so a company could not
correct a typo in the name on its own public page.

The awkward part is the slug, because it is public and already linked from every
one of that company's job pages and from wherever anyone has shared it.

- **`company_slug_history` is what makes renaming safe** rather than merely
  permitted. Overwriting the slug turns every one of those links into a 404 with
  nothing to explain the gap.
- **A retired slug stays claimed by its old owner.** Handing it to somebody else
  would silently redirect their traffic to a company that is not them — so the
  uniqueness check covers history as well as current slugs. A company renaming
  back to something it used itself is fine; that is somebody changing their mind.
- **The public page redirects (308) rather than serving both addresses.** One
  company living at two live URLs splits every share and every search result.
- Rows in the history are never removed. "We stopped honouring that address after
  a year" is the same failure arriving later.

## The feed

`services/social.ts`. This **reverses** an earlier decision, which is worth
knowing rather than discovering: company pages deliberately carried no free text
from third parties because moderating it is a full-time job. The measured
response figures are unchanged and still the first thing a candidate should read;
this sits beside them.

- **Posting is public and separate from profile visibility.** A candidate whose
  profile is `private` can still post, and posting does not change that. The two
  answer different questions — "can companies find me in a search" and "did I
  choose to say this out loud" — and collapsing them would either silence people
  or expose them. The privacy policy has a section saying exactly this.
- **A company can turn replies off** (`companies.allowsInteraction`), and the
  rule is enforced in `assertCanInteract`, not by hiding buttons — none of these
  endpoints is reachable only through the UI. The company's own team is exempt,
  because closing a thread to the public should not stop the people who wrote the
  post replying under it. `interactionsAllowed` on the feed row is what hides the
  controls; the service is what makes it true. Two tests fail if the check is
  removed.
- **Hidden and deleted are different columns.** An author removing their own post
  and a post being taken down are different events; one flag makes it impossible
  to tell which happened or to put one back. Everything is soft-deleted, so a
  thread keeps its shape and a moderator can still read what was said.
- **`REPORTS_TO_HIDE` (3) distinct people**, enforced by a unique index on
  (reporter, target). A count one determined person can run up is a takedown
  button with extra steps. Reporting is verified-only for the same reason —
  three throwaway addresses would otherwise hide anything.
- **Posting as a company requires membership** of the organization that owns it,
  and the author's user id is kept on every post: "who actually said this" is the
  first question when one goes wrong.
- Feed paging is **keyset on `created_at`**, not an offset — an offset re-reads
  everything before it and shifts under the reader every time somebody posts.
- The `follows` table has two nullable targets with a `num_nonnulls(...) = 1`
  check added by hand in `drizzle/0011_*.sql`, plus partial unique indexes:
  Postgres counts nulls as distinct, so a plain unique index over both columns
  would let the same follow be inserted repeatedly.

Post bodies go through `Markdown.svelte` like every other stranger-written text —
that is the only safe way to render them.

### Verification

`services/verification.ts`. The check beside a company's name is the only thing
on this site that claims "this is really them", so it has to be earned.

- **DNS, not email.** Publishing a TXT record requires control of the domain. A
  `@company.com` address only proves somebody works there, which is a weaker and
  different claim — plenty of people have an address at a company they cannot
  speak for.
- **Public resolvers (1.1.1.1, 8.8.8.8), never the host's.** A machine inside a
  company network resolves internal records nobody outside can see; verifying
  against those proves nothing about what the world sees.
- **TXT values are joined before comparing.** The protocol splits anything over
  255 characters into chunks, and comparing a chunk never matches — a bug that
  only appears on long tokens, which ours are. There is a live-DNS test for it.
- **Changing the domain always drops the verification and mints a new token.**
  Otherwise: verify a domain you control, then point the record at one you do not.
- **A failed re-check never clears an existing badge.** A transient DNS failure
  must not un-verify somebody mid-outage; deciding when a stale verification
  lapses belongs to a scheduled job, not to the button somebody just pressed.
- Every failure returns a **reason**, because "not there yet" and "DNS is down"
  need different words in front of someone waiting on propagation.

**`VerifiedMark` is the only place the check is drawn**, and it appears on every
surface that names a company: the company page and directory, job cards, the job
detail page, the landing page's recent roles, and feed posts. Each of those had to
select the flag through its own join, which is the cost of the badge meaning
something — a component that guessed from the data it happened to have would show
it inconsistently. It carries a tooltip saying _what_ was checked rather than the
bare word "verified", and nothing renders it unless `domainVerifiedAt` is set.

### Moderation

`services/moderation.ts` is the half that reads the queue. The auto-hide in
`social.ts` is a stopgap and behaves like one: it cannot unhide a false positive
and never fires for a report that stops at two.

- **Authority is computed from the row being acted on, never claimed by the
  caller.** Two sources and no others: the company whose post a reply sits under,
  and platform staff. A company runs its own threads and nobody else's — there is
  a test that fails if a different company can reach them.
- **`users.platformAdmin` has no way to be set from the product.** Somebody who
  can moderate every company's threads is not a role a signup flow should grant,
  and a screen for promoting admins is the first thing an attacker looks for. Set
  it by hand, in the database, deliberately.
- **The guard is in the service, not the route group.** Remote functions are
  reachable as raw HTTP, so living under `(admin)` protects nothing. Denials are
  not-found, so probing does not confirm the queue exists.
- **Hiding is never deleting.** The row stays and the author is unchanged, so an
  action can be undone and can be shown to have been wrong. **Dismissing also
  un-hides** — an auto-hide a human has looked at and disagreed with must
  actually come back, or the threshold becomes a permanent takedown nobody chose.
- **Reports are closed, not deleted, whichever way the decision went.** "We looked
  and left it up" is an outcome somebody may need to point at, and a queue that
  only remembers takedowns reads as a record of censorship.
- The queue renders post bodies as **plain text, not markdown** — a moderator
  needs to see exactly what was written, including anything formatting would
  swallow.

## Markdown

All user-supplied markdown renders through `#lib/components/ui/Markdown.svelte`,
which calls `renderMarkdown` (marked + DOMPurify). That is the **only** place
`{@html}` may touch user content — job descriptions are written by strangers and
shown to every visitor.

- The DOMPurify config uses `KEEP_CONTENT: false` so a stripped `<script>` cannot
  leak its body as visible text. That requires **`#text` in `ALLOWED_TAGS`** —
  without it every description renders as empty tags.

## Design system

`src/lib/design/tokens.css` is the **single source of truth** for every colour,
radius, size, shadow and duration. It has four layers; only layer 1 (KNOBS) is
meant to be edited. Changing the brand colour or rounding the whole UI is a
one-line change there — see the file header.

Rules that keep it that way:

- Components reference **semantic tokens only** — `bg-surface`, `text-text-muted`,
  `border-border`, `bg-accent`, `bg-scrim`, `text-danger-on`. Never a ramp step
  (`--fann-gray-500`, `--fann-brand-600`), never a literal colour (`bg-black/40`,
  `text-white`). Tailwind's default palette is removed via `--color-*: initial`, so
  a stray `bg-red-500` fails at build rather than silently bypassing the system.
- Raw tokens are all prefixed `--fann-`; grep that to see the whole system. Only
  two stylesheets read them directly — `layout.css`'s `@layer base` and
  `motion.css` — because both target bare elements or bare classes that have no
  utility equivalent. Everywhere else goes through the semantic layer.
- Every box carries an explicit `rounded-*` class — that is what makes
  `--fann-radius` a working knob. Without the class there is nothing for it to
  change. The scale reproduces Tailwind's own values off a 4px base
  (xs 2, sm 4, md 6, lg 8, xl 12, 2xl 16, 3xl 24, 4xl 32).
- **Edges are sharp** (`--fann-radius: 0`) and no component carries a `rounded-*`
  class. If radius is reintroduced, add classes per element size and affordance
  rather than one value everywhere — `lg`+ on the 16px checkbox turns it into a
  circle, which reads as a radio button.
- **Spacing rhythm comes from `--fann-space-*`** (`page`, `panel`, `band`, `control`),
  used as `p-(--fann-space-panel)`. Reach for those before a literal `p-6`, so
  "make it roomier / tighter" stays a one-line change.
- **Page width comes from `--fann-shell-width`**, used as
  `max-w-(--fann-shell-width)`. The header, the footer and every marketing section
  read it, which is what keeps the logo, the nav and the headline below them on one
  left edge. Never hard-code `max-w-5xl` in chrome or a marketing page. `/jobs` is
  the one deliberate exception and says why in a comment.
- Control heights come from `--fann-control-*` (32/36/40/44), never literal `h-8`.
- **`data-numeric` is the whole instruction for a number.** `layout.css` gives it
  the mono family and tabular figures, so a component that marks a figure does not
  also have to remember `font-mono` — and the two cannot drift apart. Every
  salary, count, date and id in the product carries it.
- **There is one typeface: Mona Sans.** It is variable across 200–900, so a
  heading separates itself from the text under it by **weight**
  (`--fann-weight-display`, 700) rather than by a second face. That is literally
  one voice at two volumes, which pairing two faces only ever approximates, and it
  is a font file the page already had to load. `--fann-font-display` survives as
  its own token because it answers a different question — introducing a display
  face later is a change to that one line rather than to every heading rule.
- **`--fann-font-display` is the wordmark and `h1`–`h6`, nothing else.** The
  wordmark differs from a heading by weight and tracking, not by face.
- **`RollingNumber`** renders _settled_ on the server and winds back on mount, so
  the HTML contains the real figure before any JavaScript runs. A counter that has
  to animate before it is correct shows `$000K` to anyone with scripts off.

### Panels, dividers and the empty-cell trap

- Grids of cards draw their dividers as **`gap-px` over a `bg-border` container** —
  the background showing through a one-pixel gap. That means a leftover cell is not
  empty space, it is a **grey box**. Any grid using this technique must have an item
  count that fills its last row: `FeatureGrid` and `Steps` derive their column count
  from `items.length` for exactly this reason. Adding a seventh feature to a
  six-item grid is a visual bug, not a content change.
- **Dividers _inside_ a panel are dashed** (`border-dashed`); dividers _between_
  panels are solid. A solid rule inside a card reads as a second card starting.

### Focus

One rule in `layout.css` styles every focusable element: `outline: none` plus
`box-shadow: var(--fann-ring-focus)`. The ring is composed in `tokens.css` as a
surface-coloured gap followed by an accent ring, so the element keeps its own
neutral border underneath and the ring floats clear of it. Width and gap are knobs.

`outline: none` is otherwise forbidden — it is acceptable there **only** because
the line beneath it is a strictly more visible replacement, and because a
`forced-colors` block hands the outline back where `box-shadow` is discarded.
Never copy one half of that pair.

### Motion

`src/lib/design/motion.css` holds every animation on the marketing pages, and is
the only stylesheet besides `layout.css` allowed to read `--fann-*` directly.

- Everything is **scroll-driven CSS** (`animation-timeline: view()` / `scroll()`) —
  no JavaScript, no `IntersectionObserver`, nothing to hydrate.
- Three guards, and all three must hold: `@supports (animation-timeline: …)`,
  `prefers-reduced-motion: no-preference`, and keyframes that **end at the
  element's normal appearance**. Delete the file and the pages still read
  correctly. Never write a reveal that hides content with a rule the browser
  cannot un-hide.
- Classes: `.fann-reveal` (fade and a small rise), `.fann-drift` (hero lifts away
  on `exit`), `.fann-scroll-progress`, `.fann-header`, and `.fann-swap`.
- `.fann-swap` is the one **time-based** animation in the file, because it fires on
  a pointer move rather than on scroll. It re-runs by being re-mounted — wrap the
  element in `{#key}` on whatever identifies the current value. Without it, a
  readout that changes under the cursor strobes half-read words instead of
  following the pointer.
- **One reveal per section, never one per card.** `Section` carries it and nothing
  inside should. Staggering a grid's children was the obvious thing and the wrong
  one: the heading settles, then the cards arrive one at a time, and a block of the
  page spends a second looking half-built. The rise is deliberately small for the
  same reason — half-arrived content reads as a rendering fault, not an effect.

**The hero chart** (`SalaryDistribution.svelte`) is the landing page's image, and
it is drawn from the jobs table rather than designed — a picture that would be
wrong the moment the headline stopped being true. Two things in it are not
optional: pay periods are annualised before anything is plotted (an hourly rate
dropped in raw lands next to nothing and squashes every salary into the right
edge), and only the most common currency is charted, because there is no exchange
rate in this product and mixing them on one axis would be inventing one. The count
left out is shown in the caption.

### Pay bars

`PayRange` draws the shapes; **nothing explains them in prose**. Three components
sit around it and each exists because the sentence version failed:

- **`PayLegend`** is the shared key for every table of bars (`/salaries`,
  `/salaries/[slug]`, the landing page). It replaced "the bar is the range from
  the lowest tenth to the highest tenth; the solid block is the middle half, and
  the line is the middle" — three shapes described in the order a reader has to
  hold in their head while looking back up at a chart. Its swatches must keep
  matching `PayRange`'s marks; changing one without the other is the bug the
  legend exists to prevent. It is **indented into the same column as the bars**,
  because against the page edge it sits a screen's width from what it names, and
  it appears **once per shared scale**, not per table.
- **`PayComparison`** is one job against its market. It prints this job and the
  typical figure side by side _above_ the bar, and its legend names every mark
  with its value — which is what let "the diamond is this one" be deleted. It
  deliberately carries **no axis**: an axis would have to be labelled from the
  padded scale, which is a number no job has, and on a tight market
  `formatCompactCurrency` rounds the top of the range and the marker to the same
  figure, so the chart appears to say two things about one value.
- **`describePosition`** makes **one claim, counted in jobs** ("pays more than
  about 9 in 10 jobs like it"). It used to append "It is 2% above the middle."
  after a verdict keyed to the percentile — two numbers measuring different
  things, next to a chart drawing only one of them, which reads as the page
  contradicting itself.

**`.fann-header`** fades in the header's background _and its backdrop blur_ over
the first 4rem of scroll. **There is no bottom rule in any state** — a hairline
under the header cuts the top off every page, and over a hero it is a line drawn
through the middle of nothing. The separation is the blur: content passing
underneath stays visible but goes soft, which reads as depth rather than as a
divider. Deliberately outside the reduced-motion guard, because nothing moves and
someone who asked for less motion still needs to read the nav.

`--fann-surface-veil` is the translucent background it settles to, declared twice
per theme on purpose: a plain opaque fallback first, then the relative-colour
version. A browser without `oklch(from …)` gets an opaque header rather than a
transparent one, which is the right way round to fail.

## Wording

Everything a user can read is **plain, everyday language**. The house style sits at
the top of `src/lib/content/marketing.ts`; the short version:

- No word from the codebase in the interface. "Pay" not "compensation", "company"
  not "organization", "hiring stages" not "pipeline", "website" not "domain".
- Short sentences, one idea each. "You" and "we".
- **Say only what is true today.** Several features on the marketing pages were
  describing things that do not exist; the join and employer pages now carry an
  explicit "Not built yet" list beside the included one. If you ship a feature,
  move the line. If you write a claim, check it against the code first.
- **No invented testimonials, and no disclaimer that makes one acceptable.** The
  landing page has a commented slot where they go once there are real ones.

## Icons

`src/lib/design/icons.ts` is the **single source of truth**. Components import
`{ icons }` and render `<Icon icon={icons.search} />` — never a library symbol
directly, so the icon set can be swapped in one file.

- Names describe the **role**, not the picture (`icons.sortAscending`, not
  `icons.arrowUp01`). Add a new entry rather than importing a glyph inline.
- Source is `@hugeicons/core-free-icons` (data only). We deliberately do **not** use
  `@hugeicons/svelte`: it renders an empty `<svg>` and injects paths on mount, so
  icons would be missing from SSR HTML and pop in on hydration.
  `#lib/components/ui/Icon.svelte` draws them server-side and converts Hugeicons'
  camelCase attributes to kebab-case SVG.
- `Icon` is `aria-hidden` by default. Pass `label` only when the icon is the sole
  carrier of meaning (an icon-only button); beside visible text it must stay
  decorative or screen readers announce it twice.
- Sizes come from `--fann-control-*` / `--fann-row-height` (via `h-(--fann-control-md)`),
  not literal heights, so density is adjustable from `--fann-control-step`.
- Body text is 13px (`text-sm`). The accent is reserved for state (primary action,
  focus, selection, active nav), not decoration. Borders over shadows; shadows only
  for true overlays.
- The type scale is deliberately _not_ derived from a knob — it is hand-tuned, and
  changing it is a redesign rather than a setting.

---

## UI primitives

`src/lib/components/ui/` is hand-rolled — there is no component library. What each
one leans on natively, because that is the part worth not reimplementing:

- **`Dialog` and the command palette use `<dialog>` + `showModal()`.** The browser
  gives the focus trap, escape, the inert background, the top layer and
  `aria-modal`. Reimplementing those is the genuinely hard part of a dialog.
  Contents are mounted only while open, so a form inside starts fresh each time.
- **`Checkbox` is a real `<input type="checkbox">`** stretched invisibly over the
  drawn box, not a `<button role="checkbox">`. Space, label association, the
  indeterminate state and form participation all come free. It is not
  `display: none`, which would take it out of the tab order.
- **`Select` is a `<button role="combobox">` plus a `<ul role="listbox">`**,
  driven by `aria-activedescendant` so focus never leaves the trigger. Two things
  follow from that role and both bit us:
  - **`combobox` does not take its name from content** the way `button` does, so
    the visible text inside the trigger names nothing. `Field` supplies a real
    `<label for>`; a bare Select falls back to an `aria-label` built from the
    placeholder. Without that the control is unnamed.
  - `getByRole('button')` no longer finds it — an explicit role replaces the
    implicit one. The e2e spec uses `getByRole('combobox')`.
- **`Select` submits through its own hidden input**, which is why it is immune to
  the reset-on-submit trap above.
- `Tabs` uses roving tabindex with selection following focus; `Tooltip` opens on
  hover _and_ focus, since a hint only a mouse can reach is not a hint.

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

## Theme

The preference lives in a **cookie**, not `localStorage`, and `hooks.server.ts`
stamps `light`/`dark` onto `<html>` through `transformPageChunk`. That is the
whole reason for the cookie: it arrives with the document request, so the first
byte we send is already correct instead of being corrected afterwards. With
`localStorage` the server can only ever render one theme, and anything decided
server-side that depends on it cannot know which.

- The inline script in `app.html` survives for **`system` only**, and does nothing
  when the class is already stamped. Nothing in an HTTP request reports the
  operating system's colour setting, so that one case can only be resolved in the
  browser, before paint.
- `color-scheme` is bound to `html.dark` rather than left at `light dark`, so
  scrollbars and form controls follow the chosen theme rather than the OS.

## Environment and failure

- **`src/env.ts` has no working defaults.** Every variable is required and
  validated at boot; a missing or too-short `STORAGE_SIGNING_SECRET` stops the
  build with the variable's name in the message. Optional entries exist only where
  another variable selects them (the `S3_*` set, `RESEND_API_KEY`), and those are
  checked where the driver is constructed. Add a variable here in the same change
  that introduces the code reading it, and update `.env.example`.
- **Never write `process.env.NODE_ENV === 'production'`.** That comparison is
  silently false when the variable is unset, and everything it guards — `Secure`
  on the session cookie, the warning about the no-op upload scanner — fails
  towards the insecure side. Use `isProduction` / `secureCookies` from
  `#lib/server/runtime`, which read the validated variable.
- `handleError` in `hooks.server.ts` logs every uncaught failure with a generated
  reference and returns that reference to the browser, where `+error.svelte` shows
  it. In production the message is fixed — an uncaught error message routinely
  contains a query or a column name. `src/error.html` is the last-resort shell for
  failures before the app can render at all.

## Loading and optimistic updates

- **Every page-level `await` needs a `<svelte:boundary>` with a `pending`
  snippet**, and the boundary must wrap _everything that reads the suspending
  value_. A boundary around only part of the page does nothing — the suspension
  escapes to the nearest ancestor and the whole route goes blank instead.
  `<svelte:head>` cannot live inside one, so it stays at the top level.
- Skeletons come from `PageSkeleton` (header shape and page padding) plus a
  body-shaped one such as `BoardSkeleton`. **Size them to the real content**: a
  skeleton that is a different size to what replaces it causes exactly the layout
  shift it exists to prevent. They carry `aria-busy` and one spoken line rather
  than letting a screen reader read out a dozen placeholders.
- **Optimistic updates go through `command(...).updates(query.withOverride(fn))`.**
  The override paints immediately and is released when the command settles, so a
  failure puts the old value back rather than leaving the page lying. Used for
  board moves — single and bulk — where watching a dragged card sit still for
  300ms reads as a broken drag and people drag again.
- **Only override what the server does not have to tell you.** Removing a note or
  a tag needs nothing from the server to look right. _Adding_ one needs an id and
  a timestamp that have not been issued yet, and inventing them makes the row
  visibly change identity a moment later — worse than a short wait.

## Forms

- Every form ends in **`FormActions`**, which pins the buttons to the right. A
  secondary action (cancel, back) goes in its `aside` snippet and stays left, so
  the primary keeps the corner to itself. Do not hand-roll a button row.
- **`Field` shows the first issue only.** A validation pipe reports every rule that
  failed, so an empty email box returns both "Enter your email address" and "That
  does not look like an email address" — two lines saying one thing.
- **Never render `fields.allIssues()` as a list.** It includes the field issues
  that are already printed under their own fields; doing both turned a four-field
  sign-up into ten identical red lines. Use **`FormError`**, which filters to
  issues with an empty `path` — the ones no field can display.
- **A wrong password is `invalid()`, not `error()`.** `error(401)` unmounts the
  page and replaces it with the error screen, losing the form and everything typed
  into it. `invalid('…')` comes back as a form-level issue and renders in place.
- **Every form is a `Form.svelte`, never a bare `<form>`**, and every form whose
  input has a shared schema calls `preflight(schema)` — the same definition the
  server enforces, so what somebody is told while typing cannot drift from what
  will be accepted. The wrapper exists for `novalidate`; see the trap above for
  what happens without it.

## Legal and about pages

`src/lib/content/legal.ts` holds the privacy policy and terms as data, rendered by
`LegalPage.svelte`. They are written to describe **what this repository actually
does** — the session cookie, the scan gate, the file-access rules, the `email_log`
table. A policy describing a different product to the one running is worse than
none, because it is a promise nobody is keeping. Change the code, change the page.

- They have **not been reviewed by a lawyer**, and both pages say so where a reader
  can see it rather than only in a comment.
- **No placeholders on a live page.** The registered company name and address is
  the one thing still missing; it is _absent_ rather than stubbed, because
  `REPLACE` rendered on a legal page is worse than a gap and an invented company
  name is worse than either. Add a sentence naming the operator to the last
  section of `TERMS` once the entity exists.
- The name story on `/about` rests on one real fact: فَنّ (fann) is Arabic for art,
  craft or skill. The other two readings are wordplay and are presented as such.

## Data export and closing an account

`services/account.ts`. The privacy policy promises both, and until this existed it
promised them through an inbox — which is not a promise the product can keep at
volume or prove it kept at all.

- **Closing is an anonymisation, not a delete.** `applications.user_id` cascades,
  so dropping the row would erase every application the person ever sent, taking
  the employer's record of its own in-progress hiring with it. The account row
  survives with the name replaced, the password nulled and the email swapped for
  a unique `@deleted.invalid` address — unique because the column is, and replaced
  rather than blanked because a routable address is the one field left that could
  still identify somebody. There is a test that fails if this becomes a delete.
- **Profile, CVs, saved jobs, sessions, OAuth links and org memberships go
  outright.** Stored bytes are removed last and outside the transaction: object
  storage is not transactional, and an orphaned blob is a smaller problem than a
  deletion that would not commit.
- **A reported salary is unlinked, not deleted.** It is already anonymous and
  already baked into published benchmarks; deleting it would let one person
  closing an account quietly move what the market appears to pay.
- **Refused while somebody is the last owner of a company** — `team.ts` holds that
  an organization is never left without an owner, and cascading the organization
  away instead would destroy other people's jobs and other candidates'
  applications. `deletionBlocker` returns a sentence, and the page shows it
  _before_ drawing the button rather than after it is pressed.
- Nothing extra guards sign-in: `authenticate` already refuses `deactivatedAt`,
  the password hash is null, and the OAuth rows are gone.

The export is a **route**, not a remote function — the useful shape is a file
somebody keeps. It carries `Content-Disposition: attachment` and `no-store`, and
omits internal ids. Employers' internal notes are deliberately absent: they are the
company's record, not the candidate's, which is the whole premise of `note.ts`.

## Applications

Two rules run through `services/application.ts` and must not be worked around:

- **Every state change writes an `application_events` row.** That table is
  append-only and backs the candidate's status timeline, which is a product
  promise rather than a debugging aid. `visibleToCandidate` decides what surfaces;
  internal notes stay hidden.
- **`firstRespondedAt` is stamped once and never reset.** It is what makes response
  times and ghosting scores _computed_ rather than self-reported. A company that
  replies fast then goes quiet must not be able to re-earn a good metric by
  touching the record again.

Transitions are table-driven (`CANDIDATE_TRANSITIONS`, `EMPLOYER_TRANSITIONS`), so
illegal jumps are impossible rather than merely unlikely.

## Hiring reports

`services/analytics.ts` is derived entirely from rows the board already writes —
`stage_transitions`, `applications.first_responded_at`, and the application's own
timestamps. Nothing new is collected on purpose: analytics that needs its own
instrumentation quietly stops being true the first time somebody forgets to fire
an event.

- **`apply()` does not place anybody into a stage.** `current_stage_id` starts
  null and only a move writes a transition, so the top of the funnel is counted
  from `applications` and every step after it from transitions. Counting the first
  step from transitions too silently omits every candidate nobody has touched —
  exactly the group this page exists to surface. Three tests fail if that changes.
- **"Reached" means ever entered, not currently in.** Somebody hired passed
  through interview; a funnel built from current position shows an empty middle
  and a full end. Distinct per application, so moving somebody between two
  interview rounds is one person interviewed, not three.
- **A conversion rate off an empty step is null, not zero.** "0% of nobody"
  invents a problem that is not there.
- **Time in stage measures completed spells only.** An application still sitting
  in a stage is counted as `waiting` instead — folding an open-ended wait into the
  median makes a slow stage look _faster_ the longer somebody is stuck in it.
- **Stages group by kind across jobs, by name within one.** Stages belong to a
  job, so an organization with five jobs has five "Interview" columns; listing
  them unaggregated repeated the same name with no way to tell them apart. The
  kind is the right unit there for the reason it is everywhere else — a column's
  name is decoration, its kind is what decides what a candidate is told.
- **Withdrawals are never counted as people the team left waiting**, and medians
  are hidden below `MIN_SAMPLE` (5).
- Guarded on `application.view`, and the organization id comes from the guard
  rather than the request. Aggregates over candidate data are still candidate
  data: anybody who may not read the applications must not read counts of them.

The seed walks applications through the board with real gaps between moves —
instantaneous transitions would make every stage appear to take no time, and an
empty board makes the whole page unreviewable. Only applications that got a reply
are moved; the untouched ones are the backlog the report is meant to show.

## Employer response statistics

`services/reputation.ts` computes how a company actually behaves, from its own
`applications.firstRespondedAt`. Three fairness rules are load-bearing — each
exists because the obvious version of the feature is unfair, and each has a test:

- **Applications inside `GRACE_DAYS` (14) are excluded.** Somebody who applied
  this morning is waiting, not ignored; counting them punishes a company for the
  time of day.
- **Nothing is published below `MIN_SAMPLE` (5).** Two applications and two
  replies is not a 100% response rate, it is two applications. Below the
  threshold every figure is `null` and `confident` is `false` — not zero.
- **Every comparison happens in SQL against `now()`.** One clock, so "ghosted for
  30 days" cannot mean different things to the app and the database.
- **Withdrawals are excluded.** Otherwise anyone could damage an employer's
  record by applying and immediately pulling out.

`statsQuery(filter)` is written once and shared by `statsForCompany` and
`statsForCompanies`, because two definitions of "ghosted" is how a directory ends
up disagreeing with the page it links to. `describeStats` owns the phrasing for
the same reason. A company with no rows gets `unknownStats()` rather than a
missing map entry — a caller left to guess why an id vanished will guess wrong.

**A promise is not a record.** `responseSlaDays` is what the employer typed in, so
everywhere it appears on a job it is worded as a promise ("Promises 7d") and
carries a **neutral** badge. Success tone is reserved for measured behaviour in
`ResponseCard`. A green badge on an unchecked claim is precisely the habit the
product exists to break. `ResponseCard` is also the only component that renders
these figures — `compact` for a directory row, `full` for a company page — so the
two cannot describe the same employer differently.

The median reply time covers only applications that were answered, so it is always
phrased "when they do reply…". Stated flatly it reads as a promise to everyone,
which is exactly wrong for a company that answers two in five.

## Pay benchmarks

`services/salary.ts` answers the question that follows from publishing a salary —
"is that a good number?" — and the way to answer it badly is to answer it too
eagerly. Same shape of rules as `reputation.ts`, each with a test:

- **Nothing below `MIN_SAMPLE` (8) is published, and under-sized groups are never
  written to the table.** A missing row and "not enough data" are therefore the
  same thing, so no caller can render a median built from three numbers by
  forgetting a check. Eight rather than five because a percentile needs more data
  than a percentage: p10 and p90 of eight numbers are the smallest and largest,
  dressed up as statistics.
- **One currency per figure, never converted.** There is no exchange rate in this
  product. `benchmarkFor` falls back from a city to the everywhere figure — which
  changes how precise the answer is — but never across currency or source, which
  would change what it means.
- **Advertised and reported pay are never blended.** What a company puts on a
  listing and what people say they take home are different measurements; a number
  that is secretly half of each describes nothing. `source` says which you have.
- **`annualise` (SQL) and `annualMultiplier` (TS) are the one convention**, and
  live next to each other so changing one prompts the other. `landing.remote.ts`
  imports the SQL one rather than spelling it out, or the home page chart and the
  job page benchmark would disagree about what a listing pays.
- **`positionAgainst` compares midpoint to midpoint.** Comparing a range's ceiling
  to a market median is how every job becomes "above market".
- **`describePosition` is worded from the percentile, not the percent difference
  from the median** — the percentile is what the chart beside it draws. In a tight
  market a listing at the very bottom sits only 7% under the median, and wording
  keyed to that percentage called it "about the going rate" beside a marker pinned
  to the left-hand edge. There is a test for exactly that.
- The middle band is deliberately wide. A scale that finds something to say about
  every listing teaches employers that publishing a range invites a verdict, which
  ends with them not publishing one.

**Reporting your pay needs no account** (`salary.report`). Requiring one narrows
the data to people who already found work here, which would bias every published
figure towards the jobs already listed. What protects the numbers instead is the
minimum sample, a tight rate limit (`RULES.salaryReport`, keyed to the address
since there may be no user), and the fact that advertised and reported pay are
published separately — a stuffed reported figure cannot move the advertised one.
Nothing is ever marked verified, and `verifiedAt` stays unused until something
actually checks: a "verified" badge meaning "we did not look" is the exact habit
this product exists to break.

The confirmation says **how many reports the group has and whether that publishes
yet**. The figures only move on the next rebuild, so a bare thank-you beside an
unchanged page reads as a form that silently failed.

`refreshBenchmarks` clears and rebuilds inside one transaction, so a reader sees
the previous complete set or the new one — never a half-rebuilt table. That is
also why `comp_benchmarks` has plain indexes rather than a unique key: there is no
upsert needing a conflict target, which is just as well since `locationId` is null
for the everywhere figure and Postgres counts every null as distinct.

It is driven by **`POST /internal/benchmarks`**, guarded by `CRON_SECRET`, rather
than a script — the service reaches the database through the app's own
configuration, and a second copy of the aggregation SQL in a script is how the
figures on the site and the figures in the table stop matching.

**`PayRange` carries no end labels.** The scale is shared across a table so bars
are comparable, which means a number printed under one bar's left edge would name
a value that bar does not reach — narrow ranges then look like they span the whole
market. The caller draws one `PayAxis` for the set. The scale spans the data
rather than starting at zero: anchoring at zero is technically truthful and
practically useless, and the axis is labelled at both ends so nobody has to assume
where it starts.

## The hiring board

`services/pipeline.ts` owns the columns and every move between them.

- **A stage has a `kind`, and the kind is what counts.** A company may name a
  column anything — the name is decoration; `STATUS_FOR_KIND` decides what the
  candidate is told and whether the response clock stops. A column called "Coffee
  chat" whose kind is `rejected` rejects people, and the board shows the kind next
  to the name so that is never a surprise.
- **Moving into a rejecting column requires a reason**, enforced in the service.
  The dialog on the board asks for one, but the rule is not in the dialog — drag,
  select and raw HTTP all hit the same check.
- **`firstRespondedAt` is stamped once and never cleared**, including when a card
  is dragged _backwards_. Otherwise a company could reset its own response time by
  moving a card to the first column and forward again.
- **Job stages are copied from a template, never referenced.** A template edited
  six months later must not redefine the columns of a job with people already
  standing in them.
- **Deleting a stage moves its cards to the one before.** The foreign key would
  null them and they would silently reappear in the first column — which looks
  exactly like the product losing track of a person.
- `applications.current_stage_id` is a **cache** of the newest `stage_transitions`
  row. The transitions are the fact. It is declared without a Drizzle
  `references()` — the FK is added by hand in `drizzle/0006_*.sql` — because
  declaring it would make `application.ts` and `ats.ts` import each other.
- Reordering is a **two-pass update**: positions are pushed out of range, then
  written. One pass trips the `(job_id, position)` unique index the moment two
  stages swap.

### Notes

`services/note.ts`. Internal notes and the candidate's timeline are **different
tables**, not one table with a flag somebody can flip.

- Nothing in `application_notes` is ever shown to the candidate. A team needs
  somewhere to disagree with itself, and a note written under the assumption of
  privacy that later becomes public teaches people to stop writing anything
  useful down. There is a test asserting the candidate's timeline contains
  neither the note nor its words.
- Adding one writes a `note_added` event with `visibleToCandidate: false` — the
  employer's history records _that_ a note exists, never its contents.
- Notes are **soft-deleted, and only by their author**. An admin quietly removing
  a colleague's objection is exactly the failure a history exists to prevent.
- Every function starts with `assertOwned`, which scopes to the organization that
  received the application. Membership of _an_ org is not membership of _that_
  one, and denials return `not_found` — confirming an application exists tells the
  asker that a named person applied somewhere.

## Scorecards

`services/scorecard.ts`. One rule shapes the whole feature:

**Nobody reads another interviewer's scorecard until they have submitted their
own.** A panel that sees the first opinion before forming the second is not four
assessments — it is one assessment and three agreements. Everything else follows
from that:

- A scorecard is a **draft until `submittedAt`, and submitting is one-way**.
  Editing a score after reading the room is the same failure a few minutes later.
  A draft does not count: starting to type must not buy you the room's opinion.
- **`panelFor` takes the viewer** and decides what they may see. There is
  deliberately no "get all scorecards" for a caller to reach for — a fetch-then-
  filter shape is one forgotten line away from leaking exactly what the rule
  protects.
- The **count** of other submissions is shown, the content is not. Hiding the
  count makes the page look broken, and knowing two colleagues have scored tells
  you nothing about what they said.
- Ratings are **1–4, deliberately even**. An odd scale lets a panel park on the
  middle and never decide.
- Submitting requires an overall score. A blank scorecard marked complete is worse
  than none, because it reads as an opinion.

The interviewer id comes from the session, never the request: a scorecard is a
signed opinion, and letting a caller name the signer defeats the point.

## Tags, interviews and offers

**Tags** (`services/tag.ts`) are the team's shorthand and the candidate never sees
them. Deliberately not a second kind of stage: a stage says where somebody is and
changes what they are told; a tag is a margin note. Keeping them apart is what
stops a tag quietly acquiring the power to reject someone. Names are trimmed and
whitespace-collapsed, so "Referred", "referred " and "referred" are one tag.

**Interviews** (`services/interview.ts`):

- **Scheduling tells the candidate.** Booking and cancelling both email them and
  both write a candidate-visible event. An interview nobody was told about is a
  diary entry.
- **Cancelled, never deleted.** Somebody who was told about an interview needs
  their timeline to explain where it went.
- **Times are instants.** The employer's browser converts its local input to UTC;
  the candidate and the calendar file both see it in their own zone. Note that
  `Intl.DateTimeFormat` **throws** if `timeZoneName` is combined with `dateStyle`
  or `timeStyle` — use explicit components.
- `toCalendar` escapes commas, semicolons and newlines and joins with **CRLF**, as
  RFC 5545 requires. An unescaped comma in a job title silently truncates the
  entry in the calendar app. The `.ics` is a **route**, not a generated blob, so
  the same authorization that guards the application guards its calendar entry.

**Offers** (`services/offer.ts`):

- **The salary is not nullable.** This is the last step where the product's whole
  argument could be dropped, and it is where it would hurt most.
- **Drafting is silent; sending is the act.** A draft writes no event and sends no
  email — "we are putting together an offer" must not become a promise. Drafting
  is `offer.create`, sending is `offer.approve`, deliberately different roles.
- **Accepting marks the application hired** in the same transaction, or the board
  and the offer disagree about whether somebody got the job.
- Transitions are table-driven, like application statuses.

**The candidate answers their own offer.** `respondAsCandidate` in `offer.ts` is
the only path for accepting or declining, and it exists because the employer-side
`changeStatus` cannot serve it — that takes an `organizationId` and asserts
against it, so without this the employer clicks "accepted" on somebody's behalf
and the product records a decision as though the person made it.

- **`CANDIDATE_TRANSITIONS` is a separate table** from the employer's. Accepting
  and declining are the candidate's; withdrawing and expiring belong to the
  employer and the clock. Widening what a candidate may do has to be an edit to a
  named thing rather than an `if`.
- **Both sides share `applyTransition`.** Accepting also marks the application
  hired and writes the event; two copies of that would be two definitions of
  getting the job, and the board and the offer would drift apart.
- **Expiry is re-checked on the way in.** `expireOverdue` runs on a schedule, so
  between the deadline passing and the job running the row still says `sent` —
  accepting in that window would take an offer the employer considers closed.
- `sentForCandidate` returns only the **newest sent** offer per application.
  Drafts never surface (an unsent offer is the employer thinking), and asking
  somebody to decide twice is how a person accepts the wrong number.

## The candidate's own area

Everything under `(candidate)` is one person's account, tied together by tabs in
`+layout.svelte` rather than more buttons in the shared header. The layout owns
page padding and width — pages inside it start at `flex flex-col gap-6`.

- **Saving a job is invisible to the employer** (`services/saved-job.ts`). It is a
  bookmark, not a signal; a "3 people saved this" counter is one decision away
  from making somebody's browsing legible to their current manager. Closed
  listings stay in the list marked closed, because a saved job that vanishes
  looks like the product lost it.
- **A CV cannot be removed once it has been sent with an application.** The FK is
  `on delete set null`, so deleting would silently strip the attachment from an
  application an employer may be part-way through reading. Said plainly in the
  dialog instead of hidden behind a delete that does damage elsewhere.
- **`profileSchema` has no `null`s.** Kit's form input cannot carry one, so empty
  optional fields arrive as `undefined` and the service coerces to `null` — and
  it must, since passing `undefined` to an update leaves the old value in place
  and clearing a field would appear to do nothing.
- `myProfile` has deliberately no by-id sibling. The moment one exists something
  will call it without checking `visibility`, and the privacy page stops being
  true.

**Bulk moves** go through `moveToStage` per card rather than one `UPDATE`, so a
batch cannot bypass the rejection reason, the response clock or the candidate's
email. Failures are collected and named, not thrown — one withdrawn candidate must
not abandon the other twenty-nine.

## Team and invitations

`services/team.ts`. Two rules, both enforced in the service rather than in the UI:

- **An organization is never left without an owner.** Removing or demoting the
  last one leaves a company nobody can administer, with no way to fix it from
  inside the product.
- **An invite is a hashed token with an expiry, bound to the address it was sent
  to.** Only the SHA-256 lands in `org_invites`, and `acceptInvite` compares the
  invite's email to the signed-in account's — a forwarded or leaked link must not
  walk a stranger into another company's candidates. The role comes from the
  invite, never from the request, or the link is a self-service promotion to owner
  for anyone who reads the network tab.

Invitation email goes through `deliver`, so every attempt lands in `email_log`.

## Dialogs

**Never `window.confirm` or `window.prompt`.** Use `ConfirmDialog` for destructive
actions and a `Dialog` with real fields for anything that collects input.
`ConfirmDialog` takes an optional `confirmPhrase`: require it when the action
displaces or destroys something a person can see, and leave it off otherwise —
asking every time trains people to type without reading.

## Uploads

Uploaded bytes are hostile — a resume is an arbitrary file from a stranger that an
employer will open on their own machine.

- `looksLikeDeclaredType` checks magic bytes, because the browser-supplied MIME
  type is attacker-controlled. An `.exe` renamed to `.pdf` arrives claiming to be
  a PDF.
- Storage keys are generated (`buildStorageKey`), never derived from the filename,
  and the extension comes from the MIME allowlist.
- New files land with `scanStatus: 'pending'`. Nothing may be served to anyone but
  the uploader until a scanner clears it.

## Serving uploaded files

`/files/[documentId]` is the only way bytes leave storage. A route, not a signed
public URL, so authorization is re-checked on every request — a recruiter leaving
a company loses access immediately rather than when a token expires.

`resolveForViewer` allows exactly two paths in:

1. The uploader, always.
2. A member of an organization that received an application carrying **that
   specific document**. Membership alone is not enough, or any recruiter could
   read any candidate's resume by guessing an id.

Denials return `not_found` rather than `forbidden` — confirming a document exists
tells the asker that a named person applied somewhere.

**The scan gate**: nobody but the uploader sees a file until `scanStatus` is
`clean`. `pending` and `failed` both refuse; an unreadable file is not a clean
file. `FILE_SCANNER=permissive` marks everything clean without inspecting it and
warns at startup — it must never be the production setting.

**The ClamAV driver** (`scanning/clamav.ts`) speaks INSTREAM over a socket rather
than SCAN, which takes a path the daemon must be able to read — that would mean
sharing a filesystem with it and stops working the moment storage moves to S3.

- **Every failure resolves to `failed`, never `clean`.** Refused connection,
  timeout, socket error, truncated reply, unrecognised text: `parseResponse` is
  the security boundary, and a parser falling through to "clean" turns a daemon
  saying something unexpected into a silent all-clear. `FOUND` is checked before
  `OK` because a signature name can contain anything, including "OK".
- **The `z` prefix asks for NUL-terminated replies.** Without it the end of a
  response is indistinguishable from one that has not finished arriving.
- **The zero-length chunk is the terminator.** Omit it and clamd waits forever,
  so the scan dies on a timeout instead of returning a verdict.
- The driver keeps **its own timer** as well as the socket's idle timeout: a
  daemon that accepts the connection and then says nothing never trips an idle
  timeout.
- `clamAvOptions()` throws at boot when `CLAMAV_HOST` is unset rather than
  defaulting to localhost. Guessing would let a deployment believe it is scanning
  uploads while every scan quietly failed.

Three layers of test, and they cover different things: `clamav.spec.ts` checks the
wire format against a fake that only answers a well-formed request;
`clamav-live.spec.ts` checks a real daemon agrees; `gate.integration.spec.ts` puts
EICAR through `scanStoredFile` and asserts the row an employer's access check
reads. The last two skip themselves unless a daemon is listening and unless the
configured driver actually inspects bytes — under `permissive` they would pass by
returning "clean" for everything, which is the false confidence they exist to
catch.

**EICAR is only detected as a standalone file.** Buried in a larger one, ClamAV
reports clean — and so does its own `clamdscan` against the same bytes. An
assertion that it should be caught looks like a chunking bug in the driver and is
not; it measures ClamAV's signature policy, which is not ours to assert.

## AI

`src/lib/server/ai/`. Provider-agnostic through TanStack AI, and **off by
default** — every feature has a path that does not need a model, so an empty
`AI_PROVIDER` is a supported way to run this product rather than a broken one.

- **`unavailableReason()` returns a sentence, not a boolean.** The interface has
  to say _why_ AI is missing, and it names the exact variable — somebody who set
  the provider and not the key is one line from working, and "not configured"
  alone does not say which line. The button is not hidden; the reason takes its
  place, followed by "you can write this yourself".
- **`runAiTask` never throws.** Every AI feature is an assist on top of something
  a person can already do, so a failure is "that did not work, carry on" rather
  than an error page over a half-filled form. The provider's message is recorded
  and never shown — "401 unauthorized" on a job form helps nobody.
- **`ai_runs` is written on success and on failure**, before the caller sees
  anything. Tokens are the bill, "what did it actually say" is the first question
  when a model produces something wrong, and anything advisory touching hiring has
  to be auditable from day one rather than retrofitted. A failed _insert_ never
  takes the feature down — same reasoning as `deliver`.
- **The key is passed explicitly**, not via the library's `anthropicText` /
  `openaiText` helpers, which read `process.env` themselves. Everything here reads
  configuration through the validated `src/env.ts`, and a second path that quietly
  works when that one is empty is how a deployment ends up in a state nobody can
  explain.
- **Structured output, not prose scraping.** A regex over a model's markdown is a
  bug waiting for the day it adds a preamble. A draft that fails the schema is not
  shown at all — the blank editor is worse than a good draft and much better than
  half of one.
- The model is told this product's rules (publish the salary, no invented
  benefits, no adjective piles) because a generic job-description model writes the
  exact copy this site exists to argue with. Anything it lacked comes back as
  **questions for the employer**, never filled in — a model inventing a perk is
  precisely how an invented benefit gets published.

Note the library's own docs are behind the published versions: adapters are root
exports (`@tanstack/ai-anthropic`, not `/adapters`), there is no `generate`, and
messages are `{ id, role, parts: [{ type: 'text', content }] }`.

## Notifications

Anything the UI claims to send must actually go through `#lib/server/notifications`.
`deliver` writes an `email_log` row for every attempt, sent or failed — that table
is what makes "the candidate was notified" checkable rather than hopeful, and a
silently failing provider is otherwise indistinguishable from a working one.

- `deliver` **never throws**. A mail outage must not roll back a rejection the
  employer already committed to; the failure is logged for retry.
- Emails are sent **after** the transaction commits, never inside it.
- Services take an optional `origin`; omitting it skips the email. Background jobs
  and tests use that to avoid mailing real people.

## End-to-end tests

`e2e/hiring.e2e.ts` walks the whole product once in a browser: post a job →
publish → find it on the public board → apply → read it as the employer → leave a
note → turn the candidate down with a reason → the candidate reads that reason.
Run with `pnpm test:e2e`.

- **Playwright needs its own tsconfig** (`e2e/tsconfig.json`, passed with
  `--tsconfig`). Its TypeScript loader cannot resolve SvelteKit's
  `$app/tsconfig` alias and fails before it reads a single test.
- **Wait for hydration before typing.** Filling a field before Svelte takes over
  appears to work and then silently loses the value — the form submitted with an
  empty title while every other field survived, because the title was the first
  thing touched. `gotoReady` waits, and the title fill is asserted with
  `toHaveValue` so the failure surfaces where it happens.
- **The login limiter is reset in `beforeAll`.** One pass signs in four times
  against a limit of ten per fifteen minutes; two runs inside the window and the
  third dies on `/login` with no obvious cause. Only the IP-keyed rows are
  cleared — the per-account limit is the one that protects an account, and a test
  that disabled it could not notice if it broke.
- `Select` is a **`combobox`**, not a `button`. It is a `<button>` carrying an
  explicit `role="combobox"` — the ARIA pattern for a select-only combobox — and
  an explicit role replaces the implicit one, so `getByRole('button')` finds
  nothing. This was the other way round while it was a bits-ui component.

**What each layer is for.** Verified by breaking things on purpose: deleting the
service's rejection-reason check leaves the e2e test green (the dialog still
disables its button) but fails `pipeline.integration.spec.ts`; breaking the
board's confirm handler leaves every unit test green and fails the e2e test. Do
not move a rule's coverage from one to the other and assume it is still covered.

## Integration tests

Specs that touch Postgres use `#lib/server/testing/fixtures`:

- **Never select "the first published job"** from seed data. Two suites doing that
  race on `applicantCount` and on each other's applications. Call
  `createJobFixture(SUITE)` for a job nobody else will touch.
- Each spec declares a unique `SUITE` label and passes it to both `createUser` and
  `deleteFixtureUsers`. An unscoped cleanup deletes another suite's users while it
  is still running.
- `fileParallelism: false` on the server project — these all share one database, so
  parallel files put one suite's inserts inside another's assertions.

## Seed data

`scripts/seed.ts` deals each company a **response character** (`RESPONSE_CHARACTERS`)
and generates its applications to match: prompt, steady, slow, ghosting, and one
that deliberately stays under `MIN_SAMPLE`. This is not decoration. A seed where
every employer answers everyone makes the trust figures unreviewable — the amber
and red branches, the "not enough history yet" state, and "they promise 5 days, in
practice it takes longer" only appear if some seeded company actually behaves that
way. Applications are aged against each job's own `publishedAt`, so nothing applies
to a job that did not exist yet, and a slice is left inside the grace window so
that exclusion is visible rather than assumed.

Roles carry an **occupation** ("Backend Engineer") separate from their level, not
just a category ("engineering"). "The going rate for engineering" is not a figure
anybody can use. Reported salaries are seeded a little under the advertised
midpoint, because that is the honest shape of the real thing — seeding the two
identically would hide the one comparison `/salaries` exists to make.

`applicantCount` is recomputed from the real rows at the end rather than randomised.
A listing claiming 90 applicants over a pipeline holding four makes every other
number on the page look invented too.
