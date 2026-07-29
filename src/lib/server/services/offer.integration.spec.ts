import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { applicationEvents, applications } from '../db/schema/application';
import { offers } from '../db/schema/ats';
import {
	createJobFixture,
	createUser,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import { apply } from './application';
import {
	changeStatus,
	draft,
	listForApplication,
	expireOverdue,
	respondAsCandidate,
	sentForCandidate
} from './offer';

/** Unique per spec file, so cleanup cannot reach another suite's rows. */
const SUITE = 'offer';

describe.skipIf(!databaseReachable)('offers', () => {
	let fixture: JobFixture;
	let organizationId: string;
	let actorId: string;

	beforeAll(async () => {
		fixture = await createJobFixture(SUITE);
		organizationId = fixture.organizationId;
		actorId = (await createUser(SUITE)).id;
	});

	afterAll(async () => {
		await fixture.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	async function freshApplication(): Promise<string> {
		const userId = (await createUser(SUITE)).id;
		const application = await apply({ jobId: fixture.jobId, userId });
		return application.id;
	}

	async function freshOffer(applicationId: string) {
		return draft({
			applicationId,
			organizationId,
			actorUserId: actorId,
			salaryAmount: 145_000
		});
	}

	it('will not draft an offer without a salary', async () => {
		const applicationId = await freshApplication();

		// The whole argument of this product, at the last step where it could be
		// dropped.
		await expect(
			draft({ applicationId, organizationId, actorUserId: actorId, salaryAmount: 0 })
		).rejects.toThrow();
	});

	it('will not accept an expiry that has already passed', async () => {
		const applicationId = await freshApplication();

		await expect(
			draft({
				applicationId,
				organizationId,
				actorUserId: actorId,
				salaryAmount: 100_000,
				expiresAt: new Date(Date.now() - 60_000)
			})
		).rejects.toThrow();
	});

	it('starts as a draft and tells the candidate nothing', async () => {
		const applicationId = await freshApplication();
		const offer = await freshOffer(applicationId);

		expect(offer.status).toBe('draft');
		expect(offer.sentAt).toBeNull();
	});

	it('refuses transitions that are not on the table', async () => {
		const applicationId = await freshApplication();
		const offer = await freshOffer(applicationId);

		// A draft cannot be accepted — nobody has seen it.
		await expect(
			changeStatus(offer.id, applicationId, organizationId, actorId, 'accepted')
		).rejects.toThrow();
	});

	it('marks the application hired when an offer is accepted', async () => {
		const applicationId = await freshApplication();
		const offer = await freshOffer(applicationId);

		await changeStatus(offer.id, applicationId, organizationId, actorId, 'sent');
		await changeStatus(offer.id, applicationId, organizationId, actorId, 'accepted');

		// Otherwise the board and the offer disagree about whether somebody got the
		// job, and the candidate's dashboard picks one of them at random.
		const [row] = await db
			.select({ status: applications.status })
			.from(applications)
			.where(eq(applications.id, applicationId));

		expect(row.status).toBe('hired');
	});

	it('closes an offer once it is decided', async () => {
		const applicationId = await freshApplication();
		const offer = await freshOffer(applicationId);

		await changeStatus(offer.id, applicationId, organizationId, actorId, 'sent');
		await changeStatus(offer.id, applicationId, organizationId, actorId, 'declined');

		await expect(
			changeStatus(offer.id, applicationId, organizationId, actorId, 'accepted')
		).rejects.toThrow();
	});

	it('refuses an application belonging to another organization', async () => {
		const other = await createJobFixture(`${SUITE}-other`);
		const userId = (await createUser(SUITE)).id;
		const application = await apply({ jobId: other.jobId, userId });

		await expect(listForApplication(application.id, organizationId)).rejects.toThrow();

		await other.cleanup();
	});

	it('expires a lapsed offer and says so on the timeline', async () => {
		const applicationId = await freshApplication();
		const offer = await freshOffer(applicationId);
		await changeStatus(offer.id, applicationId, organizationId, actorId, 'sent');

		// Past its deadline. Aged in SQL so there is one clock.
		await db
			.update(offers)
			.set({ expiresAt: sql`now() - make_interval(days => 1)` })
			.where(eq(offers.id, offer.id));

		expect(await expireOverdue()).toBeGreaterThan(0);

		const [row] = await db.select().from(offers).where(eq(offers.id, offer.id));
		expect(row.status).toBe('expired');

		// The regression this guards: expiry used to be a bulk `UPDATE` that skipped
		// the shared transition, so a lapsed offer never reached the candidate's
		// timeline — it simply stopped being open with nothing to explain it.
		const events = await db
			.select()
			.from(applicationEvents)
			.where(eq(applicationEvents.applicationId, applicationId));

		const expiry = events.find(
			(event) => (event.payload as { offer?: string })?.offer === 'expired'
		);
		expect(expiry).toBeDefined();
		expect(expiry?.visibleToCandidate).toBe(true);
		// Nobody did this, the clock did.
		expect(expiry?.actorUserId).toBeNull();
	});

	it('leaves an offer with no deadline alone', async () => {
		const applicationId = await freshApplication();
		const offer = await freshOffer(applicationId);
		await changeStatus(offer.id, applicationId, organizationId, actorId, 'sent');

		await expireOverdue();

		// A deadline nobody stated is not a deadline.
		const [row] = await db.select().from(offers).where(eq(offers.id, offer.id));
		expect(row.status).toBe('sent');
	});

	/**
	 * The candidate's own decision.
	 *
	 * Without these the employer clicks "accepted" on somebody's behalf, which
	 * records a decision as though the person made it.
	 */
	describe('as the candidate', () => {
		/** An application plus the id of the person who made it. */
		async function ownedApplication(): Promise<{ applicationId: string; userId: string }> {
			const userId = (await createUser(SUITE)).id;
			const application = await apply({ jobId: fixture.jobId, userId });
			return { applicationId: application.id, userId };
		}

		it('accepts an offer and is hired by it', async () => {
			const { applicationId, userId } = await ownedApplication();
			const offer = await freshOffer(applicationId);
			await changeStatus(offer.id, applicationId, organizationId, actorId, 'sent');

			const decided = await respondAsCandidate(offer.id, userId, 'accepted');
			expect(decided.status).toBe('accepted');

			// The same transaction as the employer path, so the two cannot disagree
			// about whether somebody got the job.
			const [row] = await db
				.select({ status: applications.status })
				.from(applications)
				.where(eq(applications.id, applicationId));

			expect(row.status).toBe('hired');
		});

		it('declines an offer', async () => {
			const { applicationId, userId } = await ownedApplication();
			const offer = await freshOffer(applicationId);
			await changeStatus(offer.id, applicationId, organizationId, actorId, 'sent');

			const decided = await respondAsCandidate(offer.id, userId, 'declined');
			expect(decided.status).toBe('declined');
		});

		it('cannot answer an offer made to somebody else', async () => {
			const { applicationId } = await ownedApplication();
			const offer = await freshOffer(applicationId);
			await changeStatus(offer.id, applicationId, organizationId, actorId, 'sent');

			// A stranger with the id. Denied as not-found rather than forbidden:
			// confirming the offer exists tells them a named person is being hired.
			const outsider = (await createUser(SUITE)).id;
			await expect(respondAsCandidate(offer.id, outsider, 'accepted')).rejects.toThrow();
		});

		it('cannot accept an offer nobody has sent', async () => {
			const { applicationId, userId } = await ownedApplication();
			const offer = await freshOffer(applicationId);

			// A draft is the employer thinking, not an offer.
			await expect(respondAsCandidate(offer.id, userId, 'accepted')).rejects.toThrow();
		});

		it('cannot withdraw or expire an offer', async () => {
			const { applicationId, userId } = await ownedApplication();
			const offer = await freshOffer(applicationId);
			await changeStatus(offer.id, applicationId, organizationId, actorId, 'sent');

			// Those belong to the employer and to the clock. Accepting and declining
			// are the only two things this table lets a candidate do.
			await expect(respondAsCandidate(offer.id, userId, 'withdrawn')).rejects.toThrow();
			await expect(respondAsCandidate(offer.id, userId, 'expired')).rejects.toThrow();
		});

		it('cannot accept an offer whose deadline has passed', async () => {
			const { applicationId, userId } = await ownedApplication();
			const offer = await freshOffer(applicationId);
			await changeStatus(offer.id, applicationId, organizationId, actorId, 'sent');

			// `expireOverdue` runs on a schedule, so between the deadline passing and
			// the job running the row still says `sent`. Accepting in that window
			// would take an offer the employer considers closed.
			await db
				.update(offers)
				.set({ expiresAt: sql`now() - make_interval(days => 1)` })
				.where(eq(offers.id, offer.id));

			await expect(respondAsCandidate(offer.id, userId, 'accepted')).rejects.toThrow();
		});

		it('never shows the candidate a draft', async () => {
			const { applicationId, userId } = await ownedApplication();
			await freshOffer(applicationId);

			expect(await sentForCandidate(userId)).toHaveLength(0);

			const sentOffer = await freshOffer(applicationId);
			await changeStatus(sentOffer.id, applicationId, organizationId, actorId, 'sent');

			const visible = await sentForCandidate(userId);
			expect(visible).toHaveLength(1);
			expect(visible[0].id).toBe(sentOffer.id);
		});

		it('shows only the newest offer when one supersedes another', async () => {
			const { applicationId, userId } = await ownedApplication();

			const first = await freshOffer(applicationId);
			await changeStatus(first.id, applicationId, organizationId, actorId, 'sent');
			await changeStatus(first.id, applicationId, organizationId, actorId, 'withdrawn');

			const second = await freshOffer(applicationId);
			await changeStatus(second.id, applicationId, organizationId, actorId, 'sent');

			// Asking somebody to decide twice on the same job is how a person accepts
			// the wrong number.
			const visible = await sentForCandidate(userId);
			expect(visible).toHaveLength(1);
			expect(visible[0].id).toBe(second.id);
		});
	});
});
