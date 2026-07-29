import { sql } from 'drizzle-orm';
import { db } from '../db';

/**
 * What actually happened to the people who applied.
 *
 * Everything here is derived from rows the board already writes — the
 * `stage_transitions` audit trail, `applications.first_responded_at`, and the
 * application's own timestamps. Nothing new is collected, which is deliberate: an
 * analytics feature that needs its own instrumentation is one that quietly stops
 * being true whenever somebody forgets to fire an event.
 *
 * Two things shape every query below:
 *
 *   1. **An application that was never moved has no transition row.** `apply()`
 *      does not place anybody into a stage — `current_stage_id` starts null and
 *      only a move writes a transition. So the top of the funnel is counted from
 *      `applications`, and every stage after it from transitions. Counting the
 *      first step from transitions too would silently omit every candidate nobody
 *      has touched, which is exactly the group this is most useful for seeing.
 *   2. **A withdrawal is the candidate's decision.** It is shown, never counted
 *      against the team, and never treated as a stage they failed to move
 *      somebody out of.
 */

/**
 * Below this, a median is not shown.
 *
 * Same reasoning as the public response statistics, and the same number: under
 * five, one slow week moves the figure more than the team's actual habits do, and
 * a number that swings like that gets managed to rather than learned from.
 */
export const MIN_SAMPLE = 5;

/** `db.execute` requires an index signature on its row type. */
type Row = Record<string, unknown>;

/**
 * Scope for every figure.
 *
 * `organizationId` is not optional and is applied in SQL rather than filtered
 * afterwards — these are counts of other people's applications, and a
 * fetch-then-filter shape is one forgotten line away from showing a company
 * somebody else's hiring.
 */
export interface AnalyticsScope {
	organizationId: string;
	/** Narrow to one job. Null means every job the organization has. */
	jobId?: string | null;
	/** Only applications from the last N days. Null means all of them. */
	windowDays?: number | null;
}

function scopeFilter(scope: AnalyticsScope) {
	const parts = [sql`a.organization_id = ${scope.organizationId}`];
	if (scope.jobId) parts.push(sql`a.job_id = ${scope.jobId}`);
	if (scope.windowDays) {
		// Computed against the database clock, so "the last 30 days" does not depend
		// on which machine asked.
		parts.push(sql`a.created_at > now() - make_interval(days => ${scope.windowDays})`);
	}
	return sql.join(parts, sql` and `);
}

export interface FunnelStep {
	kind: string;
	label: string;
	/** Applications that ever reached this step, whatever happened afterwards. */
	reached: number;
	/** Share of the previous step that got this far. Null for the first step. */
	conversion: number | null;
}

/** The order a candidate moves through. `rejected` is an exit, not a step. */
const FUNNEL: { kind: string; label: string }[] = [
	{ kind: 'applied', label: 'Applied' },
	{ kind: 'screening', label: 'Screened' },
	{ kind: 'interview', label: 'Interviewed' },
	{ kind: 'offer', label: 'Offered' },
	{ kind: 'hired', label: 'Hired' }
];

/**
 * How far people got.
 *
 * "Reached" means ever entered a stage of that kind, not currently sitting in
 * one — somebody hired passed through interview, and a funnel built from current
 * position would show an empty middle and a full end.
 */
export async function funnel(scope: AnalyticsScope): Promise<FunnelStep[]> {
	const rows = await db.execute<Row>(sql`
		with scoped as (
			select a.id, a.status
			from applications a
			where ${scopeFilter(scope)}
		),
		-- Every kind each application ever entered. Distinct, because a team that
		-- moves somebody back and forth between two interview rounds has interviewed
		-- one person, not three.
		reached as (
			select distinct t.application_id, s.kind
			from stage_transitions t
			join job_stages s on s.id = t.to_stage_id
			where t.application_id in (select id from scoped)
		)
		select
			-- The first step is everyone who applied, counted from the applications
			-- themselves: an application nobody has moved has no transition row.
			(select count(*) from scoped)::int as applied,
			(select count(*) from reached where kind = 'screening')::int as screening,
			(select count(*) from reached where kind = 'interview')::int as interview,
			(select count(*) from reached where kind = 'offer')::int as offer,
			(select count(*) from reached where kind = 'hired')::int as hired
	`);

	const counts = rows[0] ?? {};

	return FUNNEL.map((step, index) => {
		const reached = Number(counts[step.kind] ?? 0);
		const previous = index === 0 ? null : Number(counts[FUNNEL[index - 1].kind] ?? 0);

		return {
			...step,
			reached,
			// Null rather than zero when the step before it is empty: "0% of nobody"
			// is not a conversion rate, and drawing it as one invents a problem.
			conversion: previous === null || previous === 0 ? null : reached / previous
		};
	});
}

export interface StageDuration {
	stageId: string;
	name: string;
	kind: string;
	/** Median days spent in this stage, or null below the minimum sample. */
	medianDays: number | null;
	/** How many completed spells the median is built from. */
	sample: number;
	/** People sitting in it right now, and how long the longest has waited. */
	waiting: number;
	longestWaitDays: number | null;
}

/**
 * How long people sit in each stage.
 *
 * A spell ends when the next transition happens. Applications still in a stage
 * are counted separately rather than folded into the median with "so far" as
 * their duration — an open-ended wait dragged into an average makes a slow stage
 * look faster the longer somebody is stuck in it, which is precisely backwards.
 *
 * **Grouped by kind across jobs, and by stage within one.** Stages belong to a
 * job, so every job has its own "Interview" row; listing them unaggregated showed
 * the same column name five times with no way to tell which was which. The kind
 * is the right unit there for the same reason it is everywhere else in this
 * codebase — a column's name is decoration, its kind is what actually decides
 * what happens to a candidate. Pick one job and the real names come back, because
 * then they identify something.
 */
export async function timeInStage(scope: AnalyticsScope): Promise<StageDuration[]> {
	const grouped = !scope.jobId;
	const rows = await db.execute<Row>(sql`
		with scoped as (
			select a.id, a.status
			from applications a
			where ${scopeFilter(scope)}
		),
		spells as (
			select
				t.to_stage_id as stage_id,
				t.created_at as entered_at,
				lead(t.created_at) over (
					partition by t.application_id order by t.created_at
				) as left_at,
				sc.status
			from stage_transitions t
			join scoped sc on sc.id = t.application_id
			where t.to_stage_id is not null
		)
		select
			${grouped ? sql`s.kind::text` : sql`s.id::text`} as stage_id,
			${grouped ? sql`initcap(s.kind::text)` : sql`s.name`} as name,
			s.kind::text as kind,
			percentile_cont(0.5) within group (
				order by extract(epoch from (sp.left_at - sp.entered_at)) / 86400
			) filter (where sp.left_at is not null) as median_days,
			count(*) filter (where sp.left_at is not null)::int as sample,
			-- Still here. A withdrawal is the candidate's decision, so somebody who
			-- pulled out is not a person this team has left waiting.
			count(*) filter (where sp.left_at is null and sp.status <> 'withdrawn')::int as waiting,
			max(extract(epoch from (now() - sp.entered_at)) / 86400)
				filter (where sp.left_at is null and sp.status <> 'withdrawn') as longest_wait_days
		from spells sp
		join job_stages s on s.id = sp.stage_id
		${
			grouped
				? sql`group by s.kind order by min(s.position)`
				: sql`group by s.id, s.name, s.kind, s.position order by s.position`
		}
	`);

	return rows.map((row) => {
		const sample = Number(row.sample ?? 0);
		return {
			stageId: String(row.stage_id),
			name: String(row.name),
			kind: String(row.kind),
			// Suppressed below the threshold rather than shown with a caveat: a
			// caveat beside a number is read as the number.
			medianDays: sample >= MIN_SAMPLE && row.median_days != null ? Number(row.median_days) : null,
			sample,
			waiting: Number(row.waiting ?? 0),
			longestWaitDays: row.longest_wait_days == null ? null : Number(row.longest_wait_days)
		};
	});
}

export interface Headline {
	/** Median days to a first reply. Null below the minimum sample. */
	medianResponseDays: number | null;
	responseSample: number;
	/** Median days from applying to being hired. Null below the minimum sample. */
	medianTimeToHireDays: number | null;
	hireSample: number;
	/** Applications with no reply yet, excluding withdrawals. */
	awaitingReply: number;
	/** The longest anybody has been waiting without a reply. */
	longestWaitDays: number | null;
}

/**
 * The three numbers worth putting at the top.
 *
 * `awaitingReply` is deliberately not a median or a rate. It is a count of real
 * people currently waiting, which is the only figure on this page somebody can
 * act on this afternoon.
 */
export async function headline(scope: AnalyticsScope): Promise<Headline> {
	const rows = await db.execute<Row>(sql`
		with scoped as (
			select a.id, a.status, a.created_at, a.first_responded_at
			from applications a
			where ${scopeFilter(scope)}
		),
		hires as (
			select sc.id, sc.created_at, min(t.created_at) as hired_at
			from scoped sc
			join stage_transitions t on t.application_id = sc.id
			join job_stages s on s.id = t.to_stage_id and s.kind = 'hired'
			group by sc.id, sc.created_at
		)
		select
			percentile_cont(0.5) within group (
				order by extract(epoch from (first_responded_at - created_at)) / 86400
			) filter (where first_responded_at is not null) as median_response_days,
			count(*) filter (where first_responded_at is not null)::int as response_sample,
			(
				select percentile_cont(0.5) within group (
					order by extract(epoch from (hired_at - created_at)) / 86400
				) from hires
			) as median_time_to_hire_days,
			(select count(*) from hires)::int as hire_sample,
			count(*) filter (
				where first_responded_at is null and status <> 'withdrawn'
			)::int as awaiting_reply,
			max(extract(epoch from (now() - created_at)) / 86400) filter (
				where first_responded_at is null and status <> 'withdrawn'
			) as longest_wait_days
		from scoped
	`);

	const row = rows[0] ?? {};
	const responseSample = Number(row.response_sample ?? 0);
	const hireSample = Number(row.hire_sample ?? 0);

	return {
		medianResponseDays:
			responseSample >= MIN_SAMPLE && row.median_response_days != null
				? Number(row.median_response_days)
				: null,
		responseSample,
		medianTimeToHireDays:
			hireSample >= MIN_SAMPLE && row.median_time_to_hire_days != null
				? Number(row.median_time_to_hire_days)
				: null,
		hireSample,
		awaitingReply: Number(row.awaiting_reply ?? 0),
		longestWaitDays: row.longest_wait_days == null ? null : Number(row.longest_wait_days)
	};
}

export interface SourceBreakdown {
	source: string;
	applications: number;
	hired: number;
	/** Null until there are enough applications for a rate to mean anything. */
	hireRate: number | null;
}

/**
 * Where applicants came from, and which sources actually produce hires.
 *
 * The rate is suppressed below the minimum sample for the usual reason: one hire
 * out of two makes a source look like the best in the business.
 */
export async function bySource(scope: AnalyticsScope): Promise<SourceBreakdown[]> {
	const rows = await db.execute<Row>(sql`
		with scoped as (
			select a.id, a.source
			from applications a
			where ${scopeFilter(scope)}
		),
		hired as (
			select distinct t.application_id
			from stage_transitions t
			join job_stages s on s.id = t.to_stage_id and s.kind = 'hired'
			where t.application_id in (select id from scoped)
		)
		select
			sc.source,
			count(*)::int as applications,
			count(*) filter (where h.application_id is not null)::int as hired
		from scoped sc
		left join hired h on h.application_id = sc.id
		group by sc.source
		order by count(*) desc
	`);

	return rows.map((row) => {
		const applications = Number(row.applications ?? 0);
		const hired = Number(row.hired ?? 0);
		return {
			source: String(row.source),
			applications,
			hired,
			hireRate: applications >= MIN_SAMPLE ? hired / applications : null
		};
	});
}
