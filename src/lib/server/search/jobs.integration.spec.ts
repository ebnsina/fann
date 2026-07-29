import { describe, expect, it } from 'vitest';
import { db } from '../db';
import { searchJobs } from './jobs';

/**
 * Runs against the seeded dataset (`pnpm db:seed`). Skips when the database is
 * unreachable or empty, so it never fails a fresh checkout.
 */
const seeded = await db
	.execute<{ count: number }>('select count(*)::int as count from jobs')
	.then((rows) => (rows[0]?.count ?? 0) > 50)
	.catch(() => false);

describe.skipIf(!seeded)('job search', () => {
	it('returns a page of published jobs with a total', async () => {
		const response = await searchJobs({ perPage: 10 });

		expect(response.results).toHaveLength(10);
		expect(response.total).toBeGreaterThan(50);
		expect(response.results[0].companyName).toBeTruthy();
	});

	it('paginates without repeating or dropping rows', async () => {
		const first = await searchJobs({ perPage: 10, page: 1, sort: 'recent' });
		const second = await searchJobs({ perPage: 10, page: 2, sort: 'recent' });

		const overlap = first.results.filter((a) => second.results.some((b) => b.id === a.id));
		expect(overlap).toHaveLength(0);
		expect(second.total).toBe(first.total);
	});

	it('finds jobs by a word in the title', async () => {
		const response = await searchJobs({ q: 'frontend' });

		expect(response.total).toBeGreaterThan(0);
		// Title matches are weighted 'A', so the best hit should name the thing.
		expect(response.results[0].title.toLowerCase()).toContain('frontend');
	});

	it('tolerates a typo via trigram similarity', async () => {
		// `enginer` matches no lexeme, so anything found comes from the trigram arm.
		const response = await searchJobs({ q: 'enginer' });
		expect(response.total).toBeGreaterThan(0);
	});

	it('accepts quoted phrases without throwing on operator syntax', async () => {
		// `to_tsquery` would reject these; `websearch_to_tsquery` is why it does not.
		await expect(searchJobs({ q: '"product designer"' })).resolves.toBeTruthy();
		await expect(searchJobs({ q: 'engineer or designer' })).resolves.toBeTruthy();
		await expect(searchJobs({ q: 'engineer -manager' })).resolves.toBeTruthy();
		await expect(searchJobs({ q: 'unbalanced ( paren' })).resolves.toBeTruthy();
	});

	it('applies work mode as a hard filter, not a ranking hint', async () => {
		const response = await searchJobs({ workModes: ['remote'], perPage: 50 });

		expect(response.results.length).toBeGreaterThan(0);
		for (const job of response.results) {
			expect(job.workMode).toBe('remote');
		}
	});

	it('combines filters conjunctively', async () => {
		const response = await searchJobs({
			workModes: ['remote'],
			employmentTypes: ['full_time'],
			perPage: 50
		});

		for (const job of response.results) {
			expect(job.workMode).toBe('remote');
			expect(job.employmentType).toBe('full_time');
		}
	});

	it('filters on salary against the top of the range', async () => {
		const response = await searchJobs({ salaryMin: 200_000, perPage: 50 });

		for (const job of response.results) {
			expect(job.salaryMax).toBeGreaterThanOrEqual(200_000);
		}
	});

	/**
	 * This used to assert the opposite — that filtering to remote left exactly one
	 * work-mode facet — and that assertion was the bug.
	 *
	 * Counting a group over the fully filtered set removes every other option in
	 * that group from the sidebar, so the column changes height as you filter and,
	 * worse, there is no longer a checkbox for the value you would need to add. A
	 * multi-select group could only ever hold one value.
	 */
	it('keeps a group’s own options counted when that group is filtered', async () => {
		const all = await searchJobs({});
		const remote = await searchJobs({ workModes: ['remote'] });

		const remoteFacet = remote.facets.workMode.find((f) => f.value === 'remote');
		expect(remoteFacet?.count).toBe(remote.total);
		expect(remote.total).toBeLessThan(all.total);

		// The other modes are still offered, still counted, and unaffected by the
		// work-mode selection — which is what makes "add hybrid too" possible.
		expect(remote.facets.workMode.length).toBeGreaterThan(1);
		for (const mode of ['onsite', 'hybrid'] as const) {
			expect(remote.facets.workMode.find((f) => f.value === mode)?.count).toBe(
				all.facets.workMode.find((f) => f.value === mode)?.count
			);
		}
	});

	it('still narrows every other group', async () => {
		const all = await searchJobs({});
		const remote = await searchJobs({ workModes: ['remote'] });

		// A group that is not the one being filtered must reflect the filter — the
		// number beside "Full-time" has to mean full-time *remote* jobs, or it is
		// describing a result nobody asked for.
		const total = (facets: { count: number }[]) =>
			facets.reduce((sum, facet) => sum + facet.count, 0);

		expect(total(remote.facets.employmentType)).toBe(remote.total);
		expect(total(remote.facets.experienceLevel)).toBe(remote.total);
		expect(total(remote.facets.employmentType)).toBeLessThan(total(all.facets.employmentType));
	});

	it('sorts by salary when asked', async () => {
		const response = await searchJobs({ sort: 'salary', perPage: 20 });
		const values = response.results.map((job) => job.salaryMax);

		expect(values).toEqual([...values].sort((a, b) => b - a));
	});

	it('sorts by recency when asked', async () => {
		const response = await searchJobs({ sort: 'recent', perPage: 20 });
		const times = response.results.map((job) => job.publishedAt?.getTime() ?? 0);

		expect(times).toEqual([...times].sort((a, b) => b - a));
	});

	it('returns an empty, well-formed response for a query that matches nothing', async () => {
		const response = await searchJobs({ q: 'zzzzqqqxyzzy' });

		expect(response.results).toHaveLength(0);
		expect(response.total).toBe(0);
		expect(response.facets.workMode).toEqual([]);
	});

	it('caps page size so a caller cannot ask for the whole table', async () => {
		const response = await searchJobs({ perPage: 10_000 });
		expect(response.results.length).toBeLessThanOrEqual(50);
	});

	it('scopes to a single company', async () => {
		const any = await searchJobs({ perPage: 1 });
		const slug = any.results[0].companySlug;

		const response = await searchJobs({ companySlug: slug, perPage: 50 });
		for (const job of response.results) {
			expect(job.companySlug).toBe(slug);
		}
	});
});
