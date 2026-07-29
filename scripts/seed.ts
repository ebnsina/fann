/**
 * Seeds a realistic development dataset.
 *
 * Volume matters: pagination, facet counts and ranking all look correct against
 * three rows and fall apart against two hundred. Run with `pnpm db:seed`.
 *
 * Idempotent — it clears everything it owns first, so re-running gives the same
 * shape rather than accumulating duplicates.
 */
import { hash } from '@node-rs/argon2';
import postgres from 'postgres';

process.loadEnvFile?.('.env');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const sql = postgres(url);

/** Deterministic PRNG, so a seeded database is reproducible across runs. */
let state = 42;
function random(): number {
	state = (state * 1664525 + 1013904223) % 4294967296;
	return state / 4294967296;
}
function pick<T>(items: readonly T[]): T {
	return items[Math.floor(random() * items.length)];
}
function between(min: number, max: number): number {
	return Math.floor(min + random() * (max - min));
}

const COMPANIES = [
	'Northwind Labs',
	'Ardent Systems',
	'Cobalt Analytics',
	'Meridian Health',
	'Vector Foundry',
	'Lumen Retail',
	'Harbour Financial',
	'Kestrel Robotics',
	'Solace Media',
	'Tessellate',
	'Bright Anvil',
	'Quiet Machines',
	'Foldspace',
	'Riverbank Energy',
	'Palisade Security',
	'Orchard Logistics',
	'Sable Studios',
	'Ironwood Software',
	'Verdant Bio',
	'Copper Signal'
];

const ROLES = [
	['Senior Backend Engineer', 'engineering', 'senior', 'Backend Engineer'],
	['Staff Backend Engineer', 'engineering', 'staff', 'Backend Engineer'],
	['Frontend Engineer', 'engineering', 'mid', 'Frontend Engineer'],
	['Senior Frontend Engineer', 'engineering', 'senior', 'Frontend Engineer'],
	['Full Stack Engineer', 'engineering', 'mid', 'Full Stack Engineer'],
	['Platform Engineer', 'engineering', 'senior', 'Platform Engineer'],
	['Site Reliability Engineer', 'engineering', 'senior', 'Platform Engineer'],
	['Machine Learning Engineer', 'engineering', 'senior', 'Machine Learning Engineer'],
	['Data Engineer', 'engineering', 'mid', 'Data Engineer'],
	['Mobile Engineer (iOS)', 'engineering', 'mid', 'Mobile Engineer'],
	['Engineering Manager', 'engineering', 'principal', 'Engineering Manager'],
	['Product Designer', 'design', 'mid', 'Product Designer'],
	['Senior Product Designer', 'design', 'senior', 'Product Designer'],
	['Design Systems Lead', 'design', 'staff', 'Product Designer'],
	['UX Researcher', 'design', 'mid', 'UX Researcher'],
	['Product Manager', 'product', 'mid', 'Product Manager'],
	['Senior Product Manager', 'product', 'senior', 'Product Manager'],
	['Group Product Manager', 'product', 'principal', 'Product Manager'],
	['Data Analyst', 'data', 'entry', 'Data Analyst'],
	['Analytics Engineer', 'data', 'mid', 'Analytics Engineer'],
	['Technical Recruiter', 'people', 'mid', 'Recruiter'],
	['People Operations Lead', 'people', 'senior', 'People Operations'],
	['Customer Success Manager', 'go-to-market', 'mid', 'Customer Success Manager'],
	['Account Executive', 'go-to-market', 'mid', 'Account Executive'],
	['Marketing Manager', 'go-to-market', 'mid', 'Marketing Manager']
] as const;

const SALARY_BY_LEVEL: Record<string, [number, number]> = {
	internship: [40_000, 65_000],
	entry: [70_000, 100_000],
	mid: [100_000, 145_000],
	senior: [140_000, 195_000],
	staff: [180_000, 250_000],
	principal: [210_000, 300_000],
	executive: [250_000, 400_000]
};

/**
 * How each company behaves once somebody applies.
 *
 * Response statistics are the one part of the product that cannot be reviewed
 * against invented rows — a directory where every company answers 100% of
 * applications tells you nothing about whether the feature reads correctly. So
 * companies are dealt a character, and the seeded applications are generated to
 * match it. `quiet` deliberately stays below the minimum sample, because
 * "not enough history yet" is a state the UI has to handle for real.
 */
const RESPONSE_CHARACTERS = [
	{ name: 'prompt', answers: 0.96, replyDays: [1, 4], volume: [14, 30] },
	{ name: 'steady', answers: 0.82, replyDays: [3, 9], volume: [10, 24] },
	{ name: 'slow', answers: 0.66, replyDays: [10, 25], volume: [8, 20] },
	{ name: 'ghosting', answers: 0.31, replyDays: [5, 20], volume: [12, 26] },
	{ name: 'quiet', answers: 0.75, replyDays: [2, 6], volume: [0, 4] }
] as const;

const WORK_MODES = ['onsite', 'hybrid', 'remote'] as const;
const EMPLOYMENT_TYPES = ['full_time', 'full_time', 'full_time', 'part_time', 'contract'] as const;

const CITIES = [
	['London', 'England', 'United Kingdom', 'GB', 51.5072, -0.1276, 'Europe/London'],
	['Berlin', 'Berlin', 'Germany', 'DE', 52.52, 13.405, 'Europe/Berlin'],
	['New York', 'New York', 'United States', 'US', 40.7128, -74.006, 'America/New_York'],
	['San Francisco', 'California', 'United States', 'US', 37.7749, -122.4194, 'America/Los_Angeles'],
	['Toronto', 'Ontario', 'Canada', 'CA', 43.6532, -79.3832, 'America/Toronto'],
	['Amsterdam', 'North Holland', 'Netherlands', 'NL', 52.3676, 4.9041, 'Europe/Amsterdam'],
	['Dhaka', 'Dhaka', 'Bangladesh', 'BD', 23.8103, 90.4125, 'Asia/Dhaka'],
	['Singapore', null, 'Singapore', 'SG', 1.3521, 103.8198, 'Asia/Singapore']
] as const;

function description(title: string, company: string): string {
	return [
		`## About the role`,
		``,
		`${company} is hiring a ${title}. You will work alongside a small, senior team`,
		`and own meaningful surface area from day one. We care more about how you think`,
		`than which frameworks you have used.`,
		``,
		`## What you will do`,
		``,
		`- Design, build and operate systems that other teams depend on`,
		`- Work directly with product and design rather than receiving finished specs`,
		`- Review code thoughtfully and help colleagues grow`,
		`- Improve the things that slow everyone down`,
		``,
		`## What we are looking for`,
		``,
		`- Substantial experience building and running production software`,
		`- Comfort with ambiguity and a bias toward shipping`,
		`- Clear written communication — we work asynchronously`,
		``,
		`## How we hire`,
		``,
		`A conversation, a practical exercise on your own time, and a team interview.`,
		`We publish our salary ranges and respond to every application.`
	].join('\n');
}

const DAY_MS = 86_400_000;
function daysAgo(days: number): Date {
	return new Date(Date.now() - days * DAY_MS);
}

/**
 * Application history for one company, shaped by its response character.
 *
 * Ages are drawn against each job's own publish date, so nothing applies to a
 * job that did not exist yet. A slice is deliberately left inside the two-week
 * grace window: those must not count towards the published figures, and the only
 * way to see that they don't is to have some.
 */
function applicationsFor(
	organizationId: string,
	companyJobs: { id: string; daysAgo: number }[],
	character: (typeof RESPONSE_CHARACTERS)[number],
	candidateIds: string[]
): Record<string, unknown>[] {
	const rows: Record<string, unknown>[] = [];
	const taken = new Set<string>();
	const total = between(character.volume[0], character.volume[1]);

	for (let i = 0; i < total; i++) {
		const job = pick(companyJobs);
		const userId = pick(candidateIds);
		const key = `${job.id}:${userId}`;
		if (taken.has(key)) continue;
		taken.add(key);

		const age = between(0, job.daysAgo);
		const answered = random() < character.answers;
		const replyAfter = between(character.replyDays[0], character.replyDays[1]);
		// Somebody cannot have been answered in the future.
		const replied = answered && replyAfter < age;

		let status: string;
		if (random() < 0.06) status = 'withdrawn';
		else if (!replied) status = 'submitted';
		else status = pick(['in_review', 'interviewing', 'rejected', 'rejected', 'hired']);

		rows.push({
			organization_id: organizationId,
			job_id: job.id,
			user_id: userId,
			status,
			created_at: daysAgo(age),
			updated_at: daysAgo(replied ? age - replyAfter : age),
			first_responded_at: replied ? daysAgo(age - replyAfter) : null,
			rejected_at: status === 'rejected' ? daysAgo(age - replyAfter) : null,
			rejection_reason:
				status === 'rejected' ? 'We moved forward with candidates closer to the role.' : null,
			withdrawn_at: status === 'withdrawn' ? daysAgo(Math.max(0, age - 2)) : null
		});
	}

	return rows;
}

async function main() {
	console.log('Clearing seeded data…');
	await sql`truncate jobs, companies, organizations, org_members, locations, occupations, skills, industries restart identity cascade`;
	await sql`delete from users where email like '%@seed.test'`;

	console.log('Seeding taxonomy…');
	const locationRows = await sql`
		insert into locations ${sql(
			CITIES.map(([city, region, country, code, lat, lng, tz]) => ({
				city,
				region,
				country,
				country_code: code,
				slug: `${String(city).toLowerCase().replace(/\s+/g, '-')}-${String(code).toLowerCase()}`,
				latitude: lat,
				longitude: lng,
				timezone: tz
			}))
		)} returning id`;

	// One occupation per role family, not per category. "The going rate for
	// engineering" is not a figure anybody can use; "backend engineer, senior" is.
	const occupations = [
		...new Map(ROLES.map(([, category, , occupation]) => [occupation, category])).entries()
	];
	const occupationRows = await sql`insert into occupations ${sql(
		occupations.map(([name, category]) => ({
			name,
			slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
			category
		}))
	)} returning id, name`;
	const occupationIdByName = new Map<string, string>(
		occupationRows.map((row) => [row.name as string, row.id as string])
	);

	console.log('Seeding users…');
	const passwordHash = await hash('a-long-enough-password', {
		memoryCost: 19_456,
		timeCost: 2,
		parallelism: 1,
		outputLen: 32
	});

	const [owner] = await sql`
		insert into users (email, name, password_hash, email_verified_at)
		values ('owner@seed.test', 'Seed Owner', ${passwordHash}, now())
		returning id`;

	console.log('Seeding candidates…');
	const candidateRows = await sql`
		insert into users ${sql(
			Array.from({ length: 140 }, (unused, index) => ({
				email: `candidate${index}@seed.test`,
				name: `Seed Candidate ${index}`,
				password_hash: passwordHash,
				email_verified_at: new Date()
			}))
		)} returning id`;
	const candidateIds: string[] = candidateRows.map((row) => row.id as string);

	console.log('Seeding companies and jobs…');
	let jobCount = 0;

	/** Jobs old enough to have plausible application history, per company. */
	const applicationRows: Record<string, unknown>[] = [];

	for (const name of COMPANIES) {
		const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

		const [organization] = await sql`
			insert into organizations (name, slug) values (${name}, ${slug}) returning id`;

		await sql`
			insert into org_members (organization_id, user_id, role)
			values (${organization.id}, ${owner.id}, 'owner')`;

		const [company] = await sql`
			insert into companies (organization_id, name, slug, tagline, size, founded_year, headquarters_location_id)
			values (
				${organization.id}, ${name}, ${slug},
				${`We build things people rely on.`},
				${pick(['1-10', '11-50', '51-200', '201-500', '501-1000'])},
				${between(2005, 2022)},
				${pick(locationRows).id}
			) returning id`;

		const character = pick(RESPONSE_CHARACTERS);
		const companyJobs: { id: string; daysAgo: number }[] = [];

		for (let i = 0; i < between(6, 16); i++) {
			const [title, , level, occupation] = pick(ROLES);
			const [floor, ceiling] = SALARY_BY_LEVEL[level];
			const min = between(floor, floor + (ceiling - floor) * 0.4);
			const max = between(min + 15_000, ceiling);
			const daysAgo = between(0, 60);

			const [job] = await sql`
				insert into jobs (
					organization_id, company_id, title, slug, description,
					employment_type, work_mode, experience_level, occupation_id,
					salary_min, salary_max, salary_currency, salary_period,
					status, published_at, created_by_user_id, response_sla_days
				) values (
					${organization.id}, ${company.id}, ${title},
					${`${slug}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${jobCount}`},
					${description(title, name)},
					${pick(EMPLOYMENT_TYPES)}, ${pick(WORK_MODES)}, ${level},
					${occupationIdByName.get(occupation) ?? null},
					${min}, ${max}, 'USD', 'year',
					'published', now() - ${`${daysAgo} days`}::interval,
					${owner.id}, ${pick([null, 3, 5, 7, 14])}
				) returning id`;
			// A location per job, so the city-level benchmarks have something to group
			// on and the fallback to the everywhere figure is exercised rather than
			// assumed.
			await sql`
				insert into job_locations (job_id, location_id)
				values (${job.id}, ${pick(locationRows).id})`;

			companyJobs.push({ id: job.id as string, daysAgo });
			jobCount++;
		}

		applicationRows.push(
			...applicationsFor(organization.id as string, companyJobs, character, candidateIds)
		);
	}

	console.log('Seeding applications…');
	// One statement rather than a few hundred round trips.
	const inserted =
		await sql`insert into applications ${sql(applicationRows)} returning id, first_responded_at`;

	// The timeline is a product promise, so seeded applications carry the same
	// events a real one would rather than appearing from nowhere with a status.
	await sql`insert into application_events ${sql(
		inserted.flatMap((application) => {
			const events = [
				{
					application_id: application.id as string,
					type: 'submitted',
					visible_to_candidate: true,
					payload: null
				}
			];
			if (application.first_responded_at) {
				events.push({
					application_id: application.id as string,
					type: 'status_changed',
					visible_to_candidate: true,
					payload: null
				});
			}
			return events;
		})
	)}`;

	// Derived, not invented: a listing that claims 90 applicants while the
	// pipeline shows four is the kind of detail that makes everything else suspect.
	await sql`
		update jobs set applicant_count = coalesce(counted.total, 0)
		from (select job_id, count(*)::int as total from applications group by job_id) as counted
		where jobs.id = counted.job_id`;

	/*
	 * Reported pay.
	 *
	 * Generated a little below the advertised midpoint, because that is the honest
	 * shape of this data in the real world — an advertised range is what a company
	 * hopes to attract, and what people actually take home sits under it. Seeding
	 * the two identically would hide the one comparison the explorer exists to make.
	 */
	console.log('Seeding reported salaries…');
	const seededJobs = await sql`
		select j.occupation_id, j.experience_level, j.title,
		       (j.salary_min + j.salary_max) / 2 as midpoint,
		       jl.location_id
		from jobs j
		left join job_locations jl on jl.job_id = j.id
		where j.occupation_id is not null`;

	const submissions = seededJobs.flatMap((job) =>
		// A handful per listing, so groups clear the minimum sample.
		Array.from({ length: between(1, 4) }, () => ({
			job_title: job.title,
			occupation_id: job.occupation_id,
			experience_level: job.experience_level,
			location_id: job.location_id,
			// Between 12% under and 4% over the advertised midpoint.
			salary_amount: Math.round(Number(job.midpoint) * (0.88 + random() * 0.16)),
			salary_currency: 'USD',
			salary_period: 'year',
			years_of_experience: between(1, 15)
		}))
	);

	await sql`insert into salary_submissions ${sql(submissions)}`;

	/*
	 * Hiring stages, and people moved through them.
	 *
	 * Without this the board is empty and every analytics figure reads zero, which
	 * makes the whole page unreviewable — the same trap the response statistics hit.
	 * Applications are walked forward step by step with a real gap between each
	 * move, because time-in-stage is measured from the distance between transitions
	 * and instantaneous moves would show every stage taking no time at all.
	 */
	console.log('Seeding hiring stages…');
	const DEFAULT_STAGES = [
		['Applied', 'applied'],
		['Screening', 'screening'],
		['Interview', 'interview'],
		['Offer', 'offer'],
		['Hired', 'hired'],
		['Not moving forward', 'rejected']
	] as const;

	const jobIdRows = await sql`select id from jobs`;
	const stageRows = await sql`
		insert into job_stages ${sql(
			jobIdRows.flatMap((job) =>
				DEFAULT_STAGES.map(([name, kind], position) => ({
					job_id: job.id as string,
					name,
					kind,
					position
				}))
			)
		)} returning id, job_id, kind`;

	const stagesByJob = new Map<string, Map<string, string>>();
	for (const row of stageRows) {
		const jobId = row.job_id as string;
		if (!stagesByJob.has(jobId)) stagesByJob.set(jobId, new Map());
		stagesByJob.get(jobId)!.set(row.kind as string, row.id as string);
	}

	console.log('Moving people through the board…');
	const transitions: Record<string, unknown>[] = [];
	const currentStage = new Map<string, string>();

	const seededApplications = await sql`
		select a.id, a.job_id, a.status, a.created_at, a.first_responded_at
		from applications a`;

	for (const application of seededApplications) {
		const stages = stagesByJob.get(application.job_id as string);
		if (!stages) continue;

		// Nobody is moved until somebody replied — the response stamp is what says a
		// human looked. Leaving the untouched ones alone is the point: they are the
		// backlog the analytics page exists to make visible.
		if (!application.first_responded_at) continue;

		const status = application.status as string;
		const path: string[] = ['applied', 'screening'];
		if (['interviewing', 'offered', 'hired'].includes(status)) path.push('interview');
		if (['offered', 'hired'].includes(status)) path.push('offer');
		if (status === 'hired') path.push('hired');
		if (status === 'rejected') path.push('rejected');

		let at = new Date(application.first_responded_at as string).getTime();

		for (const kind of path) {
			const stageId = stages.get(kind);
			if (!stageId) continue;

			transitions.push({
				application_id: application.id as string,
				to_stage_id: stageId,
				created_at: new Date(at)
			});
			currentStage.set(application.id as string, stageId);

			// A believable gap, so the medians are not all zero.
			at += between(1, 9) * DAY_MS;
		}
	}

	if (transitions.length > 0) {
		await sql`insert into stage_transitions ${sql(transitions)}`;

		// `applications.current_stage_id` is a cache of the newest transition. Left
		// unset, the board would show every card back in the first column.
		await sql`
			update applications set current_stage_id = data.stage_id::uuid
			from (values ${sql(
				[...currentStage.entries()].map(([id, stageId]) => [id, stageId])
			)}) as data(application_id, stage_id)
			where applications.id = data.application_id::uuid`;
	}

	const [{ count }] = await sql`select count(*)::int as count from jobs`;
	console.log(`\n✓ ${COMPANIES.length} companies, ${count} published jobs`);
	console.log(`  ${submissions.length} reported salaries`);
	console.log(`  ${transitions.length} moves across the hiring boards`);
	console.log('  Sign in as owner@seed.test / a-long-enough-password');

	await sql.end();
}

await main();
