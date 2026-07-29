import { chat, generateMessageId, streamToText } from '@tanstack/ai';
import * as v from 'valibot';
import { runAiTask, type AiResult } from '../index';

/**
 * Turn a title and a few notes into a first draft of a job description.
 *
 * The first AI feature here, and chosen because it is the one where the fallback
 * is obviously fine: the alternative is the blank editor that existed yesterday.
 * Nothing about a candidate is sent to a model, and nothing a model returns is
 * published — an employer reads and edits the draft before anybody sees it.
 *
 * The prompt carries this product's own rules, because a generic job-description
 * model writes the exact copy this site exists to argue with: "competitive
 * salary", a list of adjectives, and a wall of requirements nobody meets.
 */

export interface DraftInput {
	title: string;
	/** Whatever the employer typed: bullet points, a sentence, anything. */
	notes: string;
	salaryMin: number;
	salaryMax: number;
	salaryCurrency: string;
	salaryPeriod: string;
	workMode: string;
	employmentType: string;
	experienceLevel: string;
	companyName: string;
}

/** What we insist the model hands back. */
const draftSchema = v.object({
	description: v.pipe(v.string(), v.minLength(200)),
	/** Anything the model thinks is missing, shown as prompts rather than applied. */
	questions: v.array(v.string())
});

export type JobDescriptionDraft = v.InferOutput<typeof draftSchema>;

const SYSTEM = `You write job descriptions for a job board with two rules it does not bend:
every listing publishes its salary, and every applicant gets an answer.

Write in plain, everyday language. Short sentences. Address the reader as "you".

Hard rules:
- Never write "competitive salary", "market rate", or anything that avoids the number. The salary is given to you and is already shown on the listing.
- Never invent a benefit, a perk, a funding round, a team size, or anything else you were not told. If you do not know it, leave it out.
- No adjective piles ("rockstar", "ninja", "world-class", "fast-paced").
- Do not write a requirements list nobody meets. Say what the work actually is.
- Do not mention age, gender, nationality, family status, or anything else a person cannot change and that has nothing to do with the job.

Structure it in markdown with these headings, in this order:
## About the role
## What you will do
## What we are looking for
## How we hire

Return JSON with:
- "description": the markdown.
- "questions": things you needed and were not given, phrased as short questions for the employer. Empty array if you had enough.`;

export async function draftJobDescription(
	input: DraftInput,
	context: { organizationId: string; userId: string }
): Promise<AiResult<JobDescriptionDraft>> {
	return runAiTask({ task: 'job_description', ...context }, async (adapter) => {
		const stream = chat({
			adapter,
			// Structured output, so this is parsed rather than scraped out of prose —
			// a regex over a model's markdown is a bug waiting for the day it decides
			// to add a preamble.
			outputSchema: draftSchema,
			stream: false,
			messages: [
				{ id: generateMessageId(), role: 'system', parts: [{ type: 'text', content: SYSTEM }] },
				{
					id: generateMessageId(),
					role: 'user',
					parts: [
						{
							type: 'text',
							content: [
								`Company: ${input.companyName}`,
								`Role: ${input.title}`,
								`Level: ${input.experienceLevel}`,
								`Employment: ${input.employmentType}`,
								`Where: ${input.workMode}`,
								`Salary: ${input.salaryMin}–${input.salaryMax} ${input.salaryCurrency} per ${input.salaryPeriod}`,
								'',
								'Notes from the hiring team:',
								input.notes.trim() || '(none given)'
							].join('\n')
						}
					]
				}
			]
		});

		const text = await streamToText(stream as never);
		const parsed = v.safeParse(draftSchema, JSON.parse(text));

		// A draft that does not match the shape is not shown. The employer keeps the
		// blank editor, which is a worse outcome than a good draft and a much better
		// one than half a draft with a heading missing.
		if (!parsed.success) throw new Error('The model returned something unexpected.');

		return { value: parsed.output };
	});
}
