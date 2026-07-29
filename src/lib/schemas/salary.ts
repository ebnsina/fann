import * as v from 'valibot';
import { experienceLevels, salaryPeriods } from './job';

/**
 * A person reporting what they are actually paid.
 *
 * Kept short on purpose. Every extra question is a reason to abandon the form,
 * and this data is only worth having in volume — a long survey answered by nine
 * people is worse than five fields answered by three hundred.
 */
export const salaryReportSchema = v.object({
	/** As they would say it out loud. Kept for display; the occupation groups it. */
	jobTitle: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty('What is the job called?'),
		v.maxLength(120, 'That title is too long.')
	),

	/** Which role family this counts towards. Required — an ungrouped report cannot be aggregated. */
	occupationId: v.pipe(v.string('Pick the closest match.'), v.uuid('Pick the closest match.')),
	experienceLevel: v.picklist(experienceLevels, 'Pick a level.'),

	/** Optional: plenty of people will report pay but not where they are. */
	locationId: v.optional(v.union([v.literal(''), v.pipe(v.string(), v.uuid())]), ''),

	salaryAmount: v.pipe(
		v.number('Enter what you are paid.'),
		v.integer('Use whole numbers.'),
		v.minValue(1, 'Enter an amount above zero.'),
		v.maxValue(100_000_000, 'That is higher than we can record.')
	),
	salaryCurrency: v.pipe(
		v.string(),
		v.trim(),
		v.length(3, 'Use a three-letter currency code.'),
		v.toUpperCase()
	),
	salaryPeriod: v.picklist(salaryPeriods, 'Pick a period.'),

	yearsOfExperience: v.optional(
		v.pipe(
			v.number('Enter a number of years.'),
			v.integer('Use whole years.'),
			v.minValue(0, 'That cannot be negative.'),
			v.maxValue(60, 'Enter sixty years or fewer.')
		)
	)
});

export type SalaryReportInput = v.InferOutput<typeof salaryReportSchema>;
