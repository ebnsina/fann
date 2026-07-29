import * as v from 'valibot';

/**
 * How findable a candidate is.
 *
 * `anonymous` exists because the people most worth hiring are usually employed,
 * and a searchable profile their current manager can stumble across is a reason
 * not to have one at all.
 */
export const profileVisibilities = ['private', 'anonymous', 'public'] as const;

export const VISIBILITY_OPTIONS = [
	{
		value: 'private',
		label: 'Private',
		description: 'Only companies you actually apply to can see it.'
	},
	{
		value: 'anonymous',
		label: 'Without your name',
		description: 'Companies can find your profile, but not who you are, until you apply.'
	},
	{
		value: 'public',
		label: 'Public',
		description: 'Any company hiring on Fann can find you and see your name.'
	}
] as const;

/** Optional text: an empty box means "not set", never an empty string in the row. */
function optionalText(max: number, tooLong: string) {
	return v.optional(v.pipe(v.string(), v.trim(), v.maxLength(max, tooLong)), '');
}

/**
 * A link a candidate pastes in.
 *
 * Required to be http(s) rather than merely "url-shaped": these are rendered as
 * anchors, and a `javascript:` URL in an href is a scripting hole dressed as a
 * portfolio.
 */
const optionalUrl = v.optional(
	v.union(
		[
			v.literal(''),
			v.pipe(
				v.string(),
				v.trim(),
				v.url('That does not look like a web address.'),
				v.regex(/^https?:\/\//i, 'Links must start with http:// or https://'),
				v.maxLength(500, 'That address is too long.')
			)
		],
		'That does not look like a web address.'
	),
	''
);

export const profileSchema = v.object({
	headline: optionalText(120, 'Keep the headline under 120 characters.'),
	summary: optionalText(5000, 'That summary is too long.'),
	visibility: v.picklist(profileVisibilities),
	openToWork: v.optional(v.boolean(), false),

	/**
	 * What they are looking for, in the same shape jobs publish it.
	 *
	 * A product that requires every employer to name a number and then asks the
	 * candidate to guess would be arguing against itself, so this is optional and
	 * shown to nobody but them until they choose otherwise.
	 */
	desiredSalaryMin: v.optional(
		v.pipe(
			v.number('Enter a number.'),
			v.integer('Use whole numbers.'),
			v.minValue(1, 'Enter an amount above zero.'),
			v.maxValue(100_000_000, 'That is higher than we can record.')
		)
	),
	desiredSalaryCurrency: v.optional(v.pipe(v.string(), v.trim(), v.length(3)), 'USD'),

	workAuthorization: optionalText(200, 'Keep this short.'),
	noticePeriodDays: v.optional(
		v.pipe(
			v.number('Enter a number of days.'),
			v.integer('Use whole days.'),
			v.minValue(0, 'That cannot be negative.'),
			v.maxValue(365, 'Enter a year or less.')
		)
	),

	websiteUrl: optionalUrl,
	linkedinUrl: optionalUrl,
	githubUrl: optionalUrl
});

export type ProfileInput = v.InferOutput<typeof profileSchema>;
