import * as v from 'valibot';

export const organizationNameField = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty('Enter your company name.'),
	v.maxLength(120, 'That name is too long.')
);

export const createOrganizationSchema = v.object({
	name: organizationNameField,
	domain: v.optional(
		v.pipe(
			v.string(),
			v.trim(),
			v.toLowerCase(),
			// Accept what people paste — a bare domain or a full URL — and normalize
			// later. Rejecting "https://acme.com" here would just be pedantry.
			v.maxLength(253, 'That domain is too long.')
		),
		''
	)
});

export type CreateOrganizationInput = v.InferOutput<typeof createOrganizationSchema>;
