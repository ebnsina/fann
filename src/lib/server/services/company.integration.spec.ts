import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { companies } from '../db/schema/company';
import {
	createJobFixture,
	databaseReachable,
	deleteFixtureUsers,
	type JobFixture
} from '../testing/fixtures';
import { forOrganization, resolveSlug, updateProfile } from './company';

/** Unique per spec file, so cleanup cannot reach another suite's rows. */
const SUITE = 'company';

describe.skipIf(!databaseReachable)('editing a company profile', () => {
	let fixture: JobFixture;
	let other: JobFixture;

	beforeAll(async () => {
		fixture = await createJobFixture(SUITE);
		other = await createJobFixture(`${SUITE}-other`);
	});

	afterAll(async () => {
		await fixture.cleanup();
		await other.cleanup();
		await deleteFixtureUsers(SUITE);
	});

	/** The current row, plus a full valid input built from it. */
	async function draft(overrides: Record<string, string> = {}) {
		const company = (await forOrganization(fixture.organizationId))!;

		return {
			company,
			input: {
				name: company.name,
				slug: company.slug,
				tagline: '',
				about: '',
				websiteUrl: '',
				size: '' as const,
				foundedYear: '',
				...overrides
			}
		};
	}

	it('saves the fields a company could not previously change', async () => {
		const { input } = await draft({
			name: 'Renamed Co',
			tagline: 'We build things.',
			about: '## About us\n\nWe do the work.',
			websiteUrl: 'https://example.com',
			size: '11-50',
			foundedYear: '2019'
		});

		const saved = await updateProfile(fixture.organizationId, input);

		expect(saved.name).toBe('Renamed Co');
		expect(saved.tagline).toBe('We build things.');
		expect(saved.websiteUrl).toBe('https://example.com');
		expect(saved.size).toBe('11-50');
		expect(saved.foundedYear).toBe(2019);
	});

	it('stores an empty optional as null rather than an empty string', async () => {
		const { input } = await draft({ tagline: '', size: '', foundedYear: '' });
		const saved = await updateProfile(fixture.organizationId, input);

		// An empty string in the size column would fail the enum, and an empty
		// tagline would render as a blank line under the name.
		expect(saved.tagline).toBeNull();
		expect(saved.size).toBeNull();
		expect(saved.foundedYear).toBeNull();
	});

	it('keeps the old address working after a rename', async () => {
		const { company, input } = await draft();
		const oldSlug = company.slug;
		const newSlug = `${oldSlug}-renamed`;

		await updateProfile(fixture.organizationId, { ...input, slug: newSlug });

		// Every job page and every shared link still points at the old one. It must
		// resolve, and it must say where the company actually lives now.
		const resolved = await resolveSlug(oldSlug);
		expect(resolved?.currentSlug).toBe(newSlug);
		expect(resolved?.companyId).toBe(company.id);

		// And the new one resolves to itself, so a caller can treat both the same.
		expect((await resolveSlug(newSlug))?.currentSlug).toBe(newSlug);
	});

	it('refuses a web address another company already uses', async () => {
		const { input } = await draft();
		const [rival] = await db.select().from(companies).where(eq(companies.id, other.companyId));

		await expect(
			updateProfile(fixture.organizationId, { ...input, slug: rival.slug })
		).rejects.toThrow();
	});

	it('refuses an address another company used to use', async () => {
		// Retire a slug on the other company.
		const [rival] = await db.select().from(companies).where(eq(companies.id, other.companyId));
		const retired = rival.slug;

		await updateProfile(other.organizationId, {
			name: rival.name,
			slug: `${retired}-moved`,
			tagline: '',
			about: '',
			websiteUrl: '',
			size: '',
			foundedYear: ''
		});

		// Handing a retired slug to somebody else would silently redirect the old
		// owner's traffic to a company that is not them.
		const { input } = await draft();
		await expect(
			updateProfile(fixture.organizationId, { ...input, slug: retired })
		).rejects.toThrow();
	});

	it('lets a company take back an address it used itself', async () => {
		const { company, input } = await draft();
		const current = company.slug;
		const previous = `${current}-again`;

		await updateProfile(fixture.organizationId, { ...input, slug: previous });
		const back = await updateProfile(fixture.organizationId, { ...input, slug: current });

		// Renaming back and forth is somebody changing their mind, not a conflict.
		expect(back.slug).toBe(current);
	});

	it('returns null for a slug nobody has ever had', async () => {
		expect(await resolveSlug('no-such-company-anywhere')).toBeNull();
	});
});
