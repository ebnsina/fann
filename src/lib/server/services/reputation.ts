import { sql } from 'drizzle-orm';
import { db } from '../db';

/**
 * How a company actually behaves, computed from its own record.
 *
 * This is the differentiator the marketing pages promise: reply times measured
 * here rather than typed in by the company. Every number below comes from
 * `applications.first_responded_at`, which is stamped once by the service layer
 * and never cleared — a company that replies quickly and then goes quiet cannot
 * reset it by touching the record again.
 *
 * Three rules keep these figures honest, and each one exists because the obvious
 * version of this feature is unfair:
 *
 *   1. **Applications still inside the grace window are not counted.** Somebody
 *      who applied an hour ago has not been ghosted, and including them would
 *      punish a company for the time of day.
 *   2. **Nothing is published below a minimum sample.** A company with two
 *      applications and two replies is not a company with a 100% response rate;
 *      it is a company with two applications.
 *   3. **Everything is computed in SQL against `now()`.** One clock, and no
 *      chance of "ghosted for 30 days" meaning something different depending on
 *      which machine asked.
 */

/**
 * How long an employer gets before an unanswered application counts against them.
 *
 * Two weeks. Long enough that a holiday or a hiring freeze does not read as
 * ghosting, short enough that a candidate waiting on a reply would already
 * describe it as silence.
 */
export const GRACE_DAYS = 14;

/** Silence past this is not slowness. It is a non-answer. */
export const GHOSTED_DAYS = 30;

/**
 * Fewer settled applications than this and no figures are shown at all.
 *
 * Five is not statistically magic; it is the point below which a single
 * application swings a percentage by twenty points, which makes the number
 * misleading in the direction of whichever company happens to be new.
 */
export const MIN_SAMPLE = 5;

export interface ResponseStats {
	companyId: string;
	/** Applications old enough to judge — the denominator for everything else. */
	settled: number;
	/** Null until `settled` reaches `MIN_SAMPLE`. */
	responseRate: number | null;
	/** Median days to a first reply, among those that got one. Null if too few. */
	medianReplyDays: number | null;
	/** Share left with no reply for over `GHOSTED_DAYS`. Null if too few. */
	ghostedRate: number | null;
	/** True when there is enough history to say anything. */
	confident: boolean;
}

/**
 * The one query behind every figure.
 *
 * Written once and reused for a single company or a list, because two versions of
 * "what counts as ghosted" is how a directory ends up disagreeing with the page
 * it links to.
 */
function statsQuery(filter: ReturnType<typeof sql>) {
	return sql`
		select
			c.id as company_id,
			count(a.id)::int as settled,
			count(a.first_responded_at)::int as answered,
			count(*) filter (
				where a.first_responded_at is null
					and a.created_at < now() - make_interval(days => ${GHOSTED_DAYS})
			)::int as ghosted,
			percentile_cont(0.5) within group (
				order by extract(epoch from (a.first_responded_at - a.created_at)) / 86400
			) filter (where a.first_responded_at is not null) as median_reply_days
		from companies c
		join jobs j on j.company_id = c.id and j.deleted_at is null
		join applications a on a.job_id = j.id
			-- Old enough to judge. A candidate who applied this morning is waiting,
			-- not ignored.
			and a.created_at < now() - make_interval(days => ${GRACE_DAYS})
			-- A withdrawal is the candidate's decision. Counting it against the
			-- company would let anyone damage an employer's record by applying and
			-- immediately pulling out.
			and a.status <> 'withdrawn'
		where c.deleted_at is null and ${filter}
		group by c.id
	`;
}

/** `db.execute` requires an index signature on its row type. */
interface StatsRow extends Record<string, unknown> {
	company_id: string;
	settled: number;
	answered: number;
	ghosted: number;
	median_reply_days: string | number | null;
}

function toStats(row: StatsRow): ResponseStats {
	const confident = row.settled >= MIN_SAMPLE;

	return {
		companyId: row.company_id,
		settled: row.settled,
		confident,
		responseRate: confident ? row.answered / row.settled : null,
		ghostedRate: confident ? row.ghosted / row.settled : null,
		// `db.execute` hands back raw driver rows, so a numeric arrives as a string.
		// Coerce at the boundary rather than letting one masquerade as a number.
		medianReplyDays:
			confident && row.median_reply_days != null ? Number(row.median_reply_days) : null
	};
}

/** Nothing known yet — a company with no settled applications, or too few. */
export function unknownStats(companyId: string): ResponseStats {
	return {
		companyId,
		settled: 0,
		responseRate: null,
		medianReplyDays: null,
		ghostedRate: null,
		confident: false
	};
}

export async function statsForCompany(companyId: string): Promise<ResponseStats> {
	const rows = await db.execute<StatsRow>(statsQuery(sql`c.id = ${companyId}`));
	return rows[0] ? toStats(rows[0]) : unknownStats(companyId);
}

/**
 * Stats for a set of companies, in one query.
 *
 * A directory of twenty companies is otherwise twenty round trips, and they would
 * each see a slightly different `now()`.
 */
export async function statsForCompanies(companyIds: string[]): Promise<Map<string, ResponseStats>> {
	if (companyIds.length === 0) return new Map();

	// Bound each id as its own parameter. Passing a JS array to `= any($1)` fails
	// to parse as a Postgres array — see the known traps.
	const rows = await db.execute<StatsRow>(
		statsQuery(
			sql`c.id in (${sql.join(
				companyIds.map((id) => sql`${id}`),
				sql`, `
			)})`
		)
	);

	const found = new Map(rows.map((row) => [row.company_id, toStats(row)]));
	for (const id of companyIds) {
		if (!found.has(id)) found.set(id, unknownStats(id));
	}
	return found;
}

/**
 * A short, honest sentence about a company's record.
 *
 * Built here rather than in a template so the directory, the company page and the
 * job page cannot describe the same company differently.
 */
export function describeStats(stats: ResponseStats): string {
	if (!stats.confident) {
		return 'Not enough applications yet to say how they respond.';
	}

	const percent = Math.round((stats.responseRate ?? 0) * 100);
	const days = stats.medianReplyDays;

	// Phrased as "when they reply" because the median only covers the applications
	// they answered. Written as a flat "usually in 4 days" it reads as a promise to
	// everyone, which is exactly wrong for a company that answers two in five.
	const reply =
		days == null
			? ''
			: days < 1
				? ' When they do, it is usually within a day.'
				: ` When they do, it is usually after about ${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'}.`;

	return `Replied to ${percent}% of the last ${stats.settled} people who applied.${reply}`;
}
