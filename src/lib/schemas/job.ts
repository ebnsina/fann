import * as v from 'valibot';

export const employmentTypes = [
	'full_time',
	'part_time',
	'contract',
	'temporary',
	'internship'
] as const;
export const workModes = ['onsite', 'hybrid', 'remote'] as const;
export const experienceLevels = [
	'internship',
	'entry',
	'mid',
	'senior',
	'staff',
	'principal',
	'executive'
] as const;
export const salaryPeriods = ['hour', 'day', 'month', 'year'] as const;

const salaryAmount = v.pipe(
	v.number('Enter a number.'),
	v.integer('Use whole numbers.'),
	v.minValue(1, 'Enter an amount above zero.'),
	v.maxValue(100_000_000, 'That is higher than we can record.')
);

/**
 * The shape of a job as an employer edits it.
 *
 * The cross-field salary check lives here rather than only in the service, so the
 * employer is told which field is wrong while filling the form instead of after
 * submitting. `publishBlockers` in the service still re-checks it — this schema
 * governs drafts, and a draft can be saved incomplete.
 */
export const jobDraftSchema = v.pipe(
	v.object({
		title: v.pipe(
			v.string(),
			v.trim(),
			v.nonEmpty('Give the role a title.'),
			v.maxLength(120, 'That title is too long.')
		),
		description: v.pipe(
			v.string(),
			v.trim(),
			v.nonEmpty('Describe the role.'),
			v.maxLength(20_000, 'That description is too long.')
		),
		employmentType: v.picklist(employmentTypes),
		workMode: v.picklist(workModes),
		experienceLevel: v.picklist(experienceLevels),
		salaryMin: salaryAmount,
		salaryMax: salaryAmount,
		salaryCurrency: v.pipe(v.string(), v.length(3, 'Use a 3-letter currency code.')),
		salaryPeriod: v.picklist(salaryPeriods),
		equityRange: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(60)), ''),
		responseSlaDays: v.optional(
			v.pipe(
				v.number(),
				v.integer(),
				v.minValue(1, 'Promise at least one day.'),
				v.maxValue(90, 'A promise longer than 90 days is not a promise.')
			)
		)
	}),
	v.forward(
		v.check(
			(input) => input.salaryMax >= input.salaryMin,
			'The maximum must be at least the minimum.'
		),
		['salaryMax']
	)
);

export type JobDraftInput = v.InferOutput<typeof jobDraftSchema>;

/** Options for the form selects, so labels are defined once. */
export const EMPLOYMENT_TYPE_OPTIONS = [
	{ value: 'full_time', label: 'Full-time' },
	{ value: 'part_time', label: 'Part-time' },
	{ value: 'contract', label: 'Contract' },
	{ value: 'temporary', label: 'Temporary' },
	{ value: 'internship', label: 'Internship' }
];

export const WORK_MODE_OPTIONS = [
	{ value: 'onsite', label: 'On-site' },
	{ value: 'hybrid', label: 'Hybrid' },
	{ value: 'remote', label: 'Remote' }
];

export const EXPERIENCE_LEVEL_OPTIONS = [
	{ value: 'internship', label: 'Internship' },
	{ value: 'entry', label: 'Entry level' },
	{ value: 'mid', label: 'Mid level' },
	{ value: 'senior', label: 'Senior' },
	{ value: 'staff', label: 'Staff' },
	{ value: 'principal', label: 'Principal' },
	{ value: 'executive', label: 'Executive' }
];

export const SALARY_PERIOD_OPTIONS = [
	{ value: 'year', label: 'per year' },
	{ value: 'month', label: 'per month' },
	{ value: 'day', label: 'per day' },
	{ value: 'hour', label: 'per hour' }
];
