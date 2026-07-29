import { and, eq, inArray, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { applications, applicationEvents } from '../db/schema/application';
import { candidateProfiles, documents } from '../db/schema/candidate';
import { companies } from '../db/schema/company';
import { oauthAccounts, sessions, users } from '../db/schema/identity';
import { jobs, savedJobs } from '../db/schema/job';
import { orgMembers, organizations } from '../db/schema/org';
import { files } from '../db/schema/platform';
import { salarySubmissions } from '../db/schema/salary';
import { storage } from '../storage';

/**
 * Getting your data out, and closing your account.
 *
 * The privacy policy promises both. Until now it promised them via an inbox,
 * which is a promise the product cannot keep at any volume and cannot prove it
 * kept at all.
 *
 * The hard part is deletion, and it is hard for one reason: **an application is
 * not only the candidate's record.** A company that has been reading somebody's
 * CV for a fortnight has a legitimate account of its own hiring, and the same
 * policy says so out loud. `applications.user_id` cascades, so deleting the user
 * row would silently erase every application the person ever sent — taking the
 * employer's side of the story with it, mid-process, with nothing to explain the
 * gap.
 *
 * So: everything personal is destroyed, and the account itself is anonymised
 * rather than dropped. What survives is the shape of an application with nobody's
 * name on it.
 *
 * Nothing extra is needed to keep a closed account out: `authenticate` already
 * refuses a row with `deactivatedAt` set, deletion nulls the password hash, and
 * the OAuth links are gone. Three independent reasons sign-in fails, which is the
 * right number for the one door that would undo all of this.
 */

/** What an export contains. Plain data — no ids that only mean something here. */
export interface AccountExport {
	exportedAt: string;
	account: { name: string; email: string; joined: string };
	profile: Record<string, unknown> | null;
	applications: Record<string, unknown>[];
	savedJobs: Record<string, unknown>[];
	documents: Record<string, unknown>[];
	salaryReports: Record<string, unknown>[];
}

/**
 * Everything held about one person, as data they can read.
 *
 * Internal notes an employer wrote are deliberately absent: they are the
 * company's record, not the candidate's, and `note.ts` exists on the premise that
 * a team can disagree with itself somewhere the candidate is not reading. The
 * candidate-visible timeline is included, which is the same thing they can
 * already see on their applications page.
 */
export async function exportFor(userId: string): Promise<AccountExport> {
	const [account] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!account) error(404, 'Not found.');

	const [profile] = await db
		.select()
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, userId))
		.limit(1);

	const applicationRows = await db
		.select({
			id: applications.id,
			appliedOn: applications.createdAt,
			status: applications.status,
			coverLetter: applications.coverLetter,
			firstRespondedAt: applications.firstRespondedAt,
			rejectionReason: applications.rejectionReason,
			withdrawnAt: applications.withdrawnAt,
			jobTitle: jobs.title,
			company: companies.name
		})
		.from(applications)
		.innerJoin(jobs, eq(jobs.id, applications.jobId))
		.innerJoin(companies, eq(companies.id, jobs.companyId))
		.where(eq(applications.userId, userId));

	const timelines = applicationRows.length
		? await db
				.select({
					applicationId: applicationEvents.applicationId,
					at: applicationEvents.createdAt,
					type: applicationEvents.type
				})
				.from(applicationEvents)
				.where(
					and(
						inArray(
							applicationEvents.applicationId,
							applicationRows.map((row) => row.id)
						),
						eq(applicationEvents.visibleToCandidate, true)
					)
				)
		: [];

	const [saved, documentRows, reports] = await Promise.all([
		db
			.select({ savedOn: savedJobs.createdAt, jobTitle: jobs.title, company: companies.name })
			.from(savedJobs)
			.innerJoin(jobs, eq(jobs.id, savedJobs.jobId))
			.innerJoin(companies, eq(companies.id, jobs.companyId))
			.where(eq(savedJobs.userId, userId)),
		db
			.select({
				label: documents.label,
				kind: documents.kind,
				uploadedOn: documents.createdAt,
				originalName: files.originalName,
				sizeBytes: files.sizeBytes
			})
			.from(documents)
			.innerJoin(files, eq(files.id, documents.fileId))
			.where(eq(documents.userId, userId)),
		db
			.select({
				reportedOn: salarySubmissions.createdAt,
				jobTitle: salarySubmissions.jobTitle,
				salaryAmount: salarySubmissions.salaryAmount,
				salaryCurrency: salarySubmissions.salaryCurrency,
				salaryPeriod: salarySubmissions.salaryPeriod
			})
			.from(salarySubmissions)
			.where(eq(salarySubmissions.userId, userId))
	]);

	return {
		exportedAt: new Date().toISOString(),
		account: {
			name: account.name,
			email: account.email,
			joined: account.createdAt.toISOString()
		},
		profile: profile ? { ...profile, id: undefined, userId: undefined } : null,
		applications: applicationRows.map((row) => ({
			...row,
			id: undefined,
			timeline: timelines
				.filter((event) => event.applicationId === row.id)
				.map((event) => ({ at: event.at, type: event.type }))
		})),
		savedJobs: saved,
		// The files themselves are downloaded from the CV page; listing them here
		// says what exists without putting megabytes inside a JSON document.
		documents: documentRows,
		salaryReports: reports
	};
}

/**
 * Why an account cannot be closed yet, or null if it can.
 *
 * Checked before anything is destroyed and returned as a sentence rather than a
 * code, because the only useful thing to tell somebody is what to do about it.
 */
export async function deletionBlocker(userId: string): Promise<string | null> {
	// The one hard blocker. `team.ts` holds that an organization is never left
	// without an owner, and deleting the last one would leave a company nobody can
	// administer — with other people's jobs and other candidates' applications
	// inside it. Cascading the organization away instead would destroy those too,
	// which is somebody else's data answering for this person's decision.
	const soleOwnerships = await db
		.select({ name: organizations.name })
		.from(orgMembers)
		.innerJoin(organizations, eq(organizations.id, orgMembers.organizationId))
		.where(
			and(
				eq(orgMembers.userId, userId),
				eq(orgMembers.role, 'owner'),
				sql`not exists (
					select 1 from org_members other
					where other.organization_id = ${orgMembers.organizationId}
						and other.role = 'owner'
						and other.user_id <> ${userId}
				)`
			)
		);

	if (soleOwnerships.length > 0) {
		const names = soleOwnerships.map((row) => row.name).join(', ');
		return `You are the only owner of ${names}. Make somebody else an owner first, or the company would be left with nobody who can administer it.`;
	}

	return null;
}

/**
 * Close an account.
 *
 * Everything personal is destroyed outright; the account row is anonymised so the
 * applications hanging off it survive without a name. Stored files go last and
 * outside the transaction — a failed delete in object storage must not roll back
 * a deletion the person already asked for, and an orphaned blob is a smaller
 * problem than an account that would not close.
 */
export async function deleteAccount(userId: string): Promise<void> {
	const blocker = await deletionBlocker(userId);
	if (blocker) error(400, blocker);

	// Read the keys before the rows are gone.
	const owned = await db
		.select({ fileId: files.id, key: files.key })
		.from(documents)
		.innerJoin(files, eq(files.id, documents.fileId))
		.where(eq(documents.userId, userId));

	await db.transaction(async (tx) => {
		// Signed out everywhere, first, so nothing can act as them mid-deletion.
		await tx.delete(sessions).where(eq(sessions.userId, userId));
		await tx.delete(oauthAccounts).where(eq(oauthAccounts.userId, userId));

		await tx.delete(candidateProfiles).where(eq(candidateProfiles.userId, userId));
		await tx.delete(savedJobs).where(eq(savedJobs.userId, userId));
		await tx.delete(documents).where(eq(documents.userId, userId));

		if (owned.length > 0) {
			await tx.delete(files).where(
				inArray(
					files.id,
					owned.map((row) => row.fileId)
				)
			);
		}

		// A reported salary is already anonymous and is already baked into published
		// figures. Unlinking it keeps somebody's decision to close an account from
		// silently moving what the market appears to pay.
		await tx
			.update(salarySubmissions)
			.set({ userId: null })
			.where(eq(salarySubmissions.userId, userId));

		// Leave every organization. Ownership was checked above, so nothing is left
		// unadministered by this.
		await tx.delete(orgMembers).where(eq(orgMembers.userId, userId));

		/*
		 * The account itself is anonymised rather than deleted.
		 *
		 * `applications.user_id` cascades: dropping this row would erase every
		 * application the person ever sent, including the employer's own record of
		 * hiring that is still in progress. The email is replaced with a unique,
		 * undeliverable address rather than blanked, because the column is unique and
		 * `NOT NULL` — and because a routable address left behind is the one piece
		 * that could still identify somebody.
		 */
		await tx
			.update(users)
			.set({
				email: `deleted-${crypto.randomUUID()}@deleted.invalid`,
				name: 'Deleted account',
				passwordHash: null,
				emailVerifiedAt: null,
				avatarFileId: null,
				deactivatedAt: new Date()
			})
			.where(eq(users.id, userId));
	});

	// Outside the transaction on purpose: object storage is not transactional, and
	// a blob that outlives its row is recoverable in a way a half-committed
	// deletion is not.
	for (const row of owned) {
		try {
			await storage.delete(row.key);
		} catch (cause) {
			console.error('Could not remove a stored file during account deletion', {
				key: row.key,
				cause
			});
		}
	}
}
