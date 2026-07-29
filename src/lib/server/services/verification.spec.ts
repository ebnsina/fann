import { Resolver } from 'node:dns/promises';
import { describe, expect, it } from 'vitest';
import { looksLikeDomain, normaliseDomain } from './verification';

describe('reading a domain somebody typed', () => {
	it('takes the host out of a pasted URL', () => {
		// What people actually paste. Asking them to work the domain out themselves
		// is how a feature like this gets abandoned half-way through.
		expect(normaliseDomain('https://www.example.com/careers')).toBe('example.com');
		expect(normaliseDomain('http://example.com')).toBe('example.com');
		expect(normaliseDomain('example.com/jobs?ref=x')).toBe('example.com');
	});

	it('normalises case, spacing and the trailing dot', () => {
		// A trailing dot is valid DNS but makes two spellings of one domain.
		expect(normaliseDomain('  Example.COM.  ')).toBe('example.com');
	});

	it('keeps a subdomain that is not www', () => {
		// `careers.example.com` is a different host and may be the one they control.
		expect(normaliseDomain('https://careers.example.com')).toBe('careers.example.com');
	});

	it('rejects things that are not domains', () => {
		for (const value of ['', 'localhost', 'not a domain', '-example.com', 'example', '..']) {
			expect(looksLikeDomain(normaliseDomain(value))).toBe(false);
		}
	});

	it('accepts ordinary ones', () => {
		for (const value of ['example.com', 'a.co', 'careers.example.co.uk', 'my-company.io']) {
			expect(looksLikeDomain(value)).toBe(true);
		}
	});
});

/**
 * The resolver, against real DNS.
 *
 * `checkDomain` itself needs a database, so this exercises the part that is easy
 * to get wrong on its own: TXT records arrive as arrays of chunks, split at 255
 * characters by the protocol, and comparing a chunk instead of the joined value
 * is a bug that only shows up on long tokens — which ours are.
 */
const online = await new Promise<boolean>((resolve) => {
	const resolver = new Resolver({ timeout: 2000, tries: 1 });
	resolver.setServers(['1.1.1.1']);
	resolver
		.resolveTxt('example.com')
		.then(() => resolve(true))
		.catch(() => resolve(false));
});

describe.skipIf(!online)('against real DNS', () => {
	function resolver() {
		const instance = new Resolver({ timeout: 5000, tries: 2 });
		// Public resolvers, not the host's: a machine inside a company network can
		// see internal records nobody outside can, and verifying against those would
		// prove nothing about what the world sees.
		instance.setServers(['1.1.1.1', '8.8.8.8']);
		return instance;
	}

	it('joins the chunks of a long TXT record', async () => {
		const records = await resolver().resolveTxt('google.com');
		const values = records.map((chunks) => chunks.join(''));

		// Every real SPF record starts this way. What matters is that joining
		// produced one coherent string rather than fragments.
		expect(values.some((value) => value.startsWith('v=spf1'))).toBe(true);
		expect(values.every((value) => !value.includes(','))).toBe(true);
	});

	it('reports a missing record as missing rather than as an error', async () => {
		// The ordinary case while somebody is still setting the record up, and the
		// one `checkDomain` must not present as an outage.
		await expect(resolver().resolveTxt('_fann-verification.example.com')).rejects.toMatchObject({
			code: expect.stringMatching(/ENODATA|ENOTFOUND/)
		});
	});
});
