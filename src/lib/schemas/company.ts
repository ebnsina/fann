import * as v from 'valibot';

/** The same bands as the column, so the form cannot offer one the database rejects. */
export const companySizes = [
	'1-10',
	'11-50',
	'51-200',
	'201-500',
	'501-1000',
	'1001-5000',
	'5000+'
] as const;

export const SIZE_OPTIONS = [
	{ value: '', label: 'Rather not say' },
	...companySizes.map((value) => ({ value, label: `${value} people` }))
];

/**
 * A link somebody pastes in.
 *
 * Required to be http(s) rather than merely url-shaped, because this is rendered
 * as an anchor on a public page and a `javascript:` URL in an href is a scripting
 * hole dressed as a website.
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

/**
 * The shape of a company as its own team edits it.
 *
 * The slug is here because a company that rebrands needs its address to follow —
 * the old one keeps working through `company_slug_history`, so changing it is
 * safe rather than merely allowed.
 */
export const companyProfileSchema = v.object({
	name: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty('Your company needs a name.'),
		v.maxLength(120, 'That name is too long.')
	),
	slug: v.pipe(
		v.string(),
		v.trim(),
		v.toLowerCase(),
		v.nonEmpty('Pick a web address.'),
		v.minLength(2, 'That is too short to be an address.'),
		v.maxLength(60, 'That is too long for an address.'),
		// Lowercase letters, numbers and single hyphens. Anything else either needs
		// escaping in a URL or is invisible in one.
		v.regex(
			/^[a-z0-9]+(?:-[a-z0-9]+)*$/,
			'Use lowercase letters, numbers and hyphens — for example acme-tools.'
		)
	),
	tagline: v.optional(
		v.pipe(v.string(), v.trim(), v.maxLength(200, 'Keep the tagline to one line.')),
		''
	),
	about: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(20_000, 'That is very long.')), ''),
	websiteUrl: optionalUrl,
	size: v.optional(v.union([v.literal(''), v.picklist(companySizes)]), ''),
	foundedYear: v.optional(
		v.pipe(
			v.string(),
			v.trim(),
			v.union([
				v.literal(''),
				v.pipe(
					v.string(),
					v.regex(/^\d{4}$/, 'Use a four-digit year.'),
					v.transform(Number),
					v.minValue(1800, 'That is earlier than we can record.'),
					// Bounded generously rather than against today's date: a company
					// founded next quarter is a real thing people type in.
					v.maxValue(2100, 'That is later than we can record.'),
					v.transform(String)
				)
			])
		),
		''
	)
});

export type CompanyProfileInput = v.InferOutput<typeof companyProfileSchema>;
