import { Resolver } from 'node:dns/promises';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { organizations } from '../db/schema/org';

/**
 * Proving a company owns the domain it claims.
 *
 * The badge on a company page is the only thing on this site that says "this is
 * really them", so it has to be earned by something we check rather than
 * something they typed. DNS is the check: publishing a TXT record requires
 * control of the domain, which is as close to "this company" as anything
 * available without asking for paperwork.
 *
 * Deliberately not email-based. A `@company.com` address proves somebody works
 * there, which is a different claim and a weaker one — plenty of people have an
 * address at a company they cannot speak for.
 */

/** The record name a company adds under their own domain. */
export const TXT_RECORD_NAME = '_fann-verification';

/**
 * How long a verification stands before it means nothing.
 *
 * Domains change hands. A badge earned once and never re-checked eventually says
 * "somebody proved this in 2026", which is not the claim it appears to make.
 * Nothing expires it automatically yet — `checkDomain` simply records when it
 * last looked, so a scheduled re-check has something to work from.
 */
export const RECHECK_AFTER_DAYS = 90;

export interface VerificationState {
	domain: string | null;
	token: string | null;
	verifiedAt: Date | null;
	checkedAt: Date | null;
	/** What to put in DNS, ready to copy. */
	recordName: string;
	recordValue: string | null;
}

/**
 * Normalise what somebody typed into a hostname.
 *
 * People paste `https://www.example.com/careers`. The check needs
 * `example.com`, and asking them to work that out themselves is how a feature
 * like this gets abandoned half-way through.
 */
export function normaliseDomain(input: string): string {
	let value = input.trim().toLowerCase();
	value = value.replace(/^https?:\/\//, '');
	value = value.split('/')[0];
	value = value.split('?')[0];
	value = value.replace(/^www\./, '');
	// A trailing dot is valid in DNS and confuses nothing here, but it makes two
	// spellings of the same domain, which the uniqueness of a claim depends on.
	return value.replace(/\.$/, '');
}

/** A domain that could plausibly exist. Not a guarantee — the DNS check is that. */
export function looksLikeDomain(value: string): boolean {
	return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value);
}

export async function stateFor(organizationId: string): Promise<VerificationState> {
	const [row] = await db
		.select({
			domain: organizations.domain,
			token: organizations.domainToken,
			verifiedAt: organizations.domainVerifiedAt,
			checkedAt: organizations.domainCheckedAt
		})
		.from(organizations)
		.where(eq(organizations.id, organizationId))
		.limit(1);

	if (!row) error(404, 'Not found.');

	return {
		...row,
		recordName: TXT_RECORD_NAME,
		recordValue: row.token
	};
}

/**
 * Claim a domain, and mint the token that will prove it.
 *
 * Changing the domain always drops any existing verification. Keeping the badge
 * across a change is precisely the hole this feature exists to close — otherwise
 * verify a domain you control, then point the record at one you do not.
 */
export async function claimDomain(
	organizationId: string,
	input: string
): Promise<VerificationState> {
	const domain = normaliseDomain(input);

	if (!domain) error(400, 'Enter the domain your company uses.');
	if (!looksLikeDomain(domain)) error(400, 'That does not look like a domain.');

	// Not unique across organizations on purpose: two companies can legitimately
	// claim the same domain (a subsidiary, a rebrand mid-flight), and only one of
	// them will be able to publish the record. The DNS check is the arbiter, not
	// a unique index that would let whoever typed it first block the other.
	const token = `fann-verify-${crypto.randomUUID()}`;

	const [row] = await db
		.update(organizations)
		.set({
			domain,
			domainToken: token,
			domainVerifiedAt: null,
			domainCheckedAt: null
		})
		.where(eq(organizations.id, organizationId))
		.returning();

	if (!row) error(404, 'Not found.');

	return {
		domain: row.domain,
		token: row.domainToken,
		verifiedAt: row.domainVerifiedAt,
		checkedAt: row.domainCheckedAt,
		recordName: TXT_RECORD_NAME,
		recordValue: row.domainToken
	};
}

export type CheckOutcome =
	| { ok: true; verifiedAt: Date }
	| { ok: false; reason: 'no-domain' | 'no-records' | 'not-found' | 'lookup-failed' };

/**
 * Look for the token in DNS.
 *
 * Uses a resolver configured with public nameservers rather than the host's,
 * because a machine inside a company network can resolve internal records that
 * nobody outside can see — verifying against those would prove nothing about
 * what the world sees.
 *
 * Every failure is a reason rather than an exception. "We could not find it" and
 * "DNS is broken" need different words in front of somebody who has just pasted a
 * record and is waiting.
 */
export async function checkDomain(organizationId: string): Promise<CheckOutcome> {
	const state = await stateFor(organizationId);
	if (!state.domain || !state.token) return { ok: false, reason: 'no-domain' };

	const resolver = new Resolver();
	resolver.setServers(['1.1.1.1', '8.8.8.8']);

	let records: string[][];
	try {
		records = await resolver.resolveTxt(`${TXT_RECORD_NAME}.${state.domain}`);
	} catch (cause) {
		// `ENODATA` and `ENOTFOUND` mean the record is not there, which is the
		// ordinary case while somebody is still setting it up — not an outage.
		const code = (cause as NodeJS.ErrnoException).code;
		const missing = code === 'ENODATA' || code === 'ENOTFOUND';

		await db
			.update(organizations)
			.set({ domainCheckedAt: new Date() })
			.where(eq(organizations.id, organizationId));

		return { ok: false, reason: missing ? 'no-records' : 'lookup-failed' };
	}

	// A TXT record arrives as chunks that have to be joined; a long value is split
	// at 255 characters by the protocol and comparing a chunk would never match.
	const values = records.map((chunks) => chunks.join(''));
	const found = values.includes(state.token);

	const verifiedAt = new Date();

	await db
		.update(organizations)
		.set({
			domainCheckedAt: verifiedAt,
			// Only ever set on success. A failed re-check does not clear an existing
			// badge here — a transient DNS failure must not un-verify somebody
			// mid-outage, and deciding when a stale verification lapses is a
			// scheduled job's decision rather than this one's.
			...(found ? { domainVerifiedAt: verifiedAt } : {})
		})
		.where(eq(organizations.id, organizationId));

	return found ? { ok: true, verifiedAt } : { ok: false, reason: 'not-found' };
}
