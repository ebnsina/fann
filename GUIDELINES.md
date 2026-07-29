# Guidelines

Standing rules for this repository. `CLAUDE.md` describes how this codebase works;
this file describes how work on it must be done.

## Git & commits (IMPORTANT)

- Author every commit as **`ebnsina <ebnsina.me@gmail.com>`** — per-repo config:
  `git config user.name "ebnsina" && git config user.email "ebnsina.me@gmail.com"`.
- **Do NOT** add a `Co-Authored-By: Claude` trailer, and do NOT use any other identity.
- Remote uses the **`github-es`** SSH host alias
  (`git@github-es:ebnsina/fann.git`).
- Internal planning docs under **`docs/`** (e.g. `docs/plan.md`) and `data/` are
  **gitignored / not committed** — keep the public repo clean (no plans/roadmap,
  no secrets). They exist locally for reference only.

## Code

- Write modular, clean, maintainable code.
- Use context7 for up-to-date documentation. Never assume an API from memory.
- Use a proper icon library rather than hand-drawn SVG in components — see the
  icon registry in `CLAUDE.md`.
- Handle 404, 500 and every other failure path gracefully. No unhandled error
  should reach the user as a stack trace or a blank page.
- **Never hard-code a value that belongs in the environment, and never give a
  secret a fallback.** A missing or invalid variable must fail at boot, loudly.
  A default is only acceptable where the value is a genuine preference (a driver
  name, a directory) and not a credential.
- Use the `Intl` web APIs for formatting numbers, currency, dates and relative
  time. Do not hand-roll formatting.

## Wording

- Plain, everyday language everywhere the user can read it. No technical jargon
  in the interface — see the house style at the top of `src/lib/content/marketing.ts`.

## Visual

- Animated halftone dot treatment for decorative surfaces.
