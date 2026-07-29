import { expect, test, type Page } from '@playwright/test';
import {
	PASSWORD,
	cleanup,
	createOrganization,
	createVerifiedUser,
	emailsTo,
	jobIdByTitle,
	resetLoginLimit,
	type SeededOrg,
	type SeededUser
} from './support/db';

/**
 * The whole product, once, through the browser.
 *
 * An employer posts a job; a candidate finds it on the public board and applies;
 * the employer reads the application, moves them through the pipeline and turns
 * them down with a reason; the candidate sees that reason on their own page.
 *
 * This is the regression net the unit tests cannot be. Every service here is
 * covered in isolation, but nothing else checks that the pieces are actually
 * wired to each other — a remote function renamed, a guard added to the wrong
 * route, a form field that stopped submitting. All of those pass every unit test.
 *
 * Accounts are seeded straight into the database rather than signed up through
 * the UI. The email-token round trip is covered by `auth.integration.spec.ts`,
 * and reproducing it here would mean either scraping a log or adding a test-only
 * mail driver — production surface that exists purely to be tested.
 */

test.describe.configure({ mode: 'serial' });

let employer: SeededUser;
let candidate: SeededUser;
let org: SeededOrg;

/** Unique per run, so a re-run cannot collide with a previous job's slug. */
const JOB_TITLE = `Staff Reliability Engineer ${Date.now()}`;

test.beforeAll(async () => {
	await resetLoginLimit();
	employer = await createVerifiedUser('employer');
	candidate = await createVerifiedUser('candidate');
	org = await createOrganization(employer.id, 'labs');
});

test.afterAll(async () => {
	await cleanup();
});

/**
 * Navigate, and wait until the page can actually be typed into.
 *
 * Filling a field before hydration finishes appears to work and then silently
 * loses the value: Svelte replaces the input when it takes over, and whatever was
 * typed goes with it. It cost a debugging session — the form submitted with an
 * empty title while every other field survived, because the title was the first
 * thing touched.
 */
async function gotoReady(page: Page, url: string) {
	await page.goto(url);
	await page.waitForLoadState('networkidle');
}

/** Sign in through the real form — the session cookie is what everything else needs. */
async function signIn(page: Page, email: string) {
	await gotoReady(page, '/login');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).not.toHaveURL(/\/login/);
}

test('an employer posts a job and a candidate applies, hears back, and is told why', async ({
	page
}) => {
	/* --- The employer posts a job ------------------------------------------ */

	await signIn(page, employer.email);
	await gotoReady(page, `/hire/${org.slug}/jobs/new`);

	const titleField = page.getByLabel('Job title');
	await titleField.fill(JOB_TITLE);
	// Assert it stuck. Without this the form submits empty and the failure surfaces
	// three steps later as "the job is not on the board".
	await expect(titleField).toHaveValue(JOB_TITLE);
	await page
		.getByLabel('Description')
		.fill(
			'We keep a large system running and we tell you what it pays. '.repeat(4) +
				'You will work on alerting, capacity and the boring parts that matter.'
		);
	await page.getByLabel('Minimum').fill('150000');
	await page.getByLabel('Maximum').fill('190000');

	await page.getByRole('button', { name: /save draft/i }).click();

	// The job exists as a draft. Nothing is public until it is published.
	await expect(page.getByRole('heading', { name: JOB_TITLE })).toBeVisible();

	await page.getByRole('button', { name: /^publish$/i }).click();
	await expect(page.getByText(/published/i).first()).toBeVisible();

	/* --- A candidate finds it and applies ----------------------------------- */

	await signIn(page, candidate.email);

	await gotoReady(page, `/jobs?q=${encodeURIComponent(JOB_TITLE)}`);
	const listing = page.getByRole('link', { name: new RegExp(JOB_TITLE, 'i') }).first();
	await expect(listing).toBeVisible();

	// The salary is on the listing. This is the product's entire claim, so it is
	// asserted on the board rather than only on the detail page.
	await expect(page.getByText('$150K').first()).toBeVisible();

	await listing.click();
	await page.getByRole('link', { name: /apply/i }).first().click();

	await page
		.getByLabel(/cover note/i)
		.fill('I have run systems this size and I would like to do it here.');
	await page.getByRole('button', { name: /send application/i }).click();

	await expect(page.getByText(/applied|submitted|thank/i).first()).toBeVisible();

	/* --- The candidate can see where it stands ------------------------------ */

	await gotoReady(page, '/me/applications');
	await expect(page.getByText(JOB_TITLE).first()).toBeVisible();

	/* --- The employer works the board --------------------------------------- */

	await signIn(page, employer.email);
	await gotoReady(page, `/hire/${org.slug}/candidates`);

	const candidateRow = page.getByRole('link', { name: new RegExp(candidate.name, 'i') }).first();
	await expect(candidateRow).toBeVisible();
	await candidateRow.click();

	// The application detail page: the CV panel, the notes, the history.
	await expect(page.getByRole('heading', { name: candidate.name })).toBeVisible();

	await page.getByLabel(/add a note/i).fill('Strong on capacity work.');
	await page.getByRole('button', { name: /add note/i }).click();
	await expect(page.getByText('Strong on capacity work.')).toBeVisible();

	// A note is internal. It must never reach the candidate's own timeline.
	await expect(page.getByText(/only your team sees these/i)).toBeVisible();

	/* --- Turned down, with a reason ----------------------------------------- */

	// Straight to the board by id rather than clicking an applicant count — a link
	// whose only distinguishing text is "1" is the kind of selector that starts
	// matching something else the moment the page gains a second number.
	const jobId = await jobIdByTitle(JOB_TITLE);
	await gotoReady(page, `/hire/${org.slug}/jobs/${jobId}/pipeline`);
	await expect(page.getByRole('heading', { name: 'Board' })).toBeVisible();

	// Our own Select: a button carrying `role="combobox"`, which is the ARIA
	// pattern for a select-only combobox. The explicit role replaces the implicit
	// button one, so `getByRole('button')` finds nothing here.
	const moveControl = page.getByRole('combobox', { name: /move to/i }).first();
	await moveControl.click();
	await page.getByRole('option', { name: /not moving forward/i }).click();

	// The gate this product exists for: turning somebody down asks for a reason.
	const reason = 'We went with someone who has run systems at a larger scale.';
	await expect(page.getByRole('heading', { name: /tell them why/i })).toBeVisible();

	const submit = page.getByRole('button', { name: /turn down and send/i });
	await expect(submit).toBeDisabled();

	await page.getByLabel('Reason').fill(reason);
	await expect(submit).toBeEnabled();
	await submit.click();

	/* --- The candidate reads the reason ------------------------------------- */

	await signIn(page, candidate.email);
	await gotoReady(page, '/me/applications');

	await expect(page.getByText(reason)).toBeVisible();

	// And it actually went out. `email_log` is what makes "they were notified"
	// checkable rather than hopeful.
	const sent = await emailsTo(candidate.email);
	expect(sent.some((row) => row.status === 'sent')).toBe(true);
});
