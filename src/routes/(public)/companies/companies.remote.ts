import { sql } from 'drizzle-orm';
import { query } from '$app/server';
import { db } from '#lib/server/db';
import { statsForCompanies, unknownStats } from '#lib/server/services/reputation';

/**
 * Companies with at least one live listing.
 *
 * A directory of companies that are not currently hiring is a dead end, so the
 * join is an inner one on purpose.
 */
export const listCompanies = query(async () => {
	const rows = await db.execute<{
		id: string;
		slug: string;
		name: string;
		tagline: string | null;
		size: string | null;
		open_roles: number;
		median_salary: number | null;
		responds_within: number | null;
		verified: boolean;
	}>(sql`
		select
			c.id, c.slug, c.name, c.tagline, c.size,
			o.domain_verified_at is not null as verified,
			count(j.id)::int as open_roles,
			percentile_cont(0.5) within group (
				order by (j.salary_min + j.salary_max) / 2.0
			)::int as median_salary,
			-- The slowest promise they make, so the figure is not flattering by omission.
			max(j.response_sla_days)::int as responds_within
		from companies c
		join organizations o on o.id = c.organization_id
		join jobs j on j.company_id = c.id
			and j.status = 'published'
			and j.deleted_at is null
			and (j.closes_at is null or j.closes_at > now())
		where c.deleted_at is null
		group by c.id, c.slug, c.name, c.tagline, c.size, o.domain_verified_at
		order by count(j.id) desc, c.name asc
	`);

	// One query for every company's record rather than one each — and one `now()`,
	// so two rows in the same table cannot disagree about what counts as ghosted.
	const stats = await statsForCompanies(rows.map((row) => row.id));

	return rows.map((row) => ({
		slug: row.slug,
		name: row.name,
		tagline: row.tagline,
		size: row.size,
		openRoles: row.open_roles,
		medianSalary: row.median_salary,
		respondsWithin: row.responds_within,
		verified: row.verified,
		/** Measured, not promised. Blank until there is enough history to be fair. */
		stats: stats.get(row.id) ?? unknownStats(row.id)
	}));
});
