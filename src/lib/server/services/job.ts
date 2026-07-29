import { and, eq, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { companies } from '../db/schema/company';
import {
	jobs,
	type EmploymentType,
	type ExperienceLevel,
	type Job,
	type JobStatus,
	type WorkMode
} from '../db/schema/job';
import { uniqueSlug } from '../slug';
import { createStagesForJob } from './pipeline';

export interface JobDraftInput {
	title: string;
	description: string;
	employmentType: EmploymentType;
	workMode: WorkMode;
	experienceLevel: ExperienceLevel;
	salaryMin: number;
	salaryMax: number;
	salaryCurrency: string;
	salaryPeriod: 'hour' | 'day' | 'month' | 'year';
	equityRange?: string | null;
	responseSlaDays?: number | null;
}

/**
 * Which status changes are allowed.
 *
 * A table rather than scattered `if` checks, so the whole lifecycle is readable in
 * one place and an illegal jump (archived → published) is impossible rather than
 * merely unlikely.
 */
const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
	draft: ['pending_review', 'published', 'archived'],
	pending_review: ['published', 'draft', 'archived'],
	published: ['paused', 'closed'],
	paused: ['published', 'closed'],
	closed: ['published', 'archived'],
	// Terminal. Recovering an archived job means duplicating it.
	archived: []
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
	return TRANSITIONS[from].includes(to);
}

/**
 * A published job must be legible to a candidate. These are checked at publish
 * time rather than on every save, so a half-written draft can still be saved.
 */
export function publishBlockers(job: Job): string[] {
	const blockers: string[] = [];

	if (job.title.trim().length < 3) blockers.push('Add a job title.');
	if (job.description.trim().length < 100) {
		blockers.push('The description is too short to be useful — aim for a few paragraphs.');
	}
	if (job.salaryMin <= 0 || job.salaryMax <= 0) blockers.push('Add a salary range.');
	if (job.salaryMin > job.salaryMax) {
		blockers.push('The salary minimum is above the maximum.');
	}

	return blockers;
}

export async function createDraft(
	organizationId: string,
	createdByUserId: string,
	input: JobDraftInput
): Promise<Job> {
	const [company] = await db
		.select({ id: companies.id })
		.from(companies)
		.where(and(eq(companies.organizationId, organizationId), isNull(companies.deletedAt)))
		.limit(1);

	if (!company) error(400, 'This organization has no company profile yet.');

	const slug = await uniqueSlug(input.title, async (candidate) => {
		const [existing] = await db
			.select({ id: jobs.id })
			.from(jobs)
			.where(eq(jobs.slug, candidate))
			.limit(1);
		return Boolean(existing);
	});

	const [job] = await db
		.insert(jobs)
		.values({ ...input, organizationId, companyId: company.id, createdByUserId, slug })
		.returning();

	// Stages are created with the job, not on first view of the board. A job that
	// can receive an application before it has columns to file it in is a job whose
	// first applicant lands nowhere.
	await createStagesForJob(job.id, organizationId);

	return job;
}

export async function updateDraft(
	jobId: string,
	organizationId: string,
	input: Partial<JobDraftInput>
): Promise<Job> {
	const [job] = await db
		.update(jobs)
		.set(input)
		.where(and(eq(jobs.id, jobId), eq(jobs.organizationId, organizationId), isNull(jobs.deletedAt)))
		.returning();

	if (!job) error(404, 'Not found.');
	return job;
}

/**
 * Move a job through its lifecycle, refusing illegal transitions and publishing
 * only what a candidate can actually act on.
 */
export async function changeStatus(
	jobId: string,
	organizationId: string,
	to: JobStatus
): Promise<Job> {
	const current = await findById(jobId, organizationId);
	if (!current) error(404, 'Not found.');

	if (!canTransition(current.status, to)) {
		error(400, `A ${current.status.replace('_', ' ')} job cannot become ${to}.`);
	}

	if (to === 'published') {
		const blockers = publishBlockers(current);
		if (blockers.length > 0) error(400, blockers.join(' '));
	}

	const [job] = await db
		.update(jobs)
		.set({
			status: to,
			// Set once, on first publish, so "posted 3 days ago" does not reset every
			// time a job is paused and resumed.
			publishedAt: to === 'published' && !current.publishedAt ? new Date() : current.publishedAt
		})
		.where(eq(jobs.id, jobId))
		.returning();

	return job;
}

export async function findById(jobId: string, organizationId: string): Promise<Job | undefined> {
	const [job] = await db
		.select()
		.from(jobs)
		.where(and(eq(jobs.id, jobId), eq(jobs.organizationId, organizationId), isNull(jobs.deletedAt)))
		.limit(1);
	return job;
}

/** Soft delete, so applications keep pointing at something real. */
export async function archive(jobId: string, organizationId: string): Promise<void> {
	await db
		.update(jobs)
		.set({ status: 'archived', deletedAt: new Date() })
		.where(and(eq(jobs.id, jobId), eq(jobs.organizationId, organizationId)));
}
