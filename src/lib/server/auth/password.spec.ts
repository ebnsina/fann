import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { countPasswordBreaches, fakeVerify, hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
	it('round-trips a password', async () => {
		const hash = await hashPassword('correct horse battery staple');
		expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
	});

	it('rejects the wrong password', async () => {
		const hash = await hashPassword('correct horse battery staple');
		expect(await verifyPassword(hash, 'Correct horse battery staple')).toBe(false);
	});

	it('salts, so the same password hashes differently every time', async () => {
		const [a, b] = await Promise.all([
			hashPassword('same-password'),
			hashPassword('same-password')
		]);
		expect(a).not.toBe(b);
	});

	it('produces an argon2id hash at the configured cost', async () => {
		expect(await hashPassword('x')).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
	});

	it('fakeVerify resolves without throwing, so login can call it unguarded', async () => {
		await expect(fakeVerify('anything')).resolves.toBeUndefined();
	});
});

describe('breached password check', () => {
	/** Stands in for the HIBP range endpoint, capturing what was actually sent. */
	function stubHibp(suffixes: Record<string, number>, seen: { prefix?: string } = {}) {
		return async (url: string | URL | Request) => {
			seen.prefix = String(url).split('/').pop();
			const body = Object.entries(suffixes)
				.map(([suffix, count]) => `${suffix}:${count}`)
				.join('\r\n');
			return new Response(body, { status: 200 });
		};
	}

	it('reports the breach count for a known password', async () => {
		const digest = createHash('sha1').update('password').digest('hex').toUpperCase();
		const fetchFn = stubHibp({ [digest.slice(5)]: 9_659_365 });

		expect(await countPasswordBreaches('password', fetchFn as typeof fetch)).toBe(9_659_365);
	});

	it('returns 0 when the suffix is absent', async () => {
		const fetchFn = stubHibp({ ABCDEF0123456789ABCDEF0123456789ABCDEF01: 5 });
		expect(await countPasswordBreaches('a-genuinely-unique-one', fetchFn as typeof fetch)).toBe(0);
	});

	it('sends only the first five hash characters, never the password', async () => {
		const seen: { prefix?: string } = {};
		const fetchFn = stubHibp({}, seen);
		await countPasswordBreaches('hunter2', fetchFn as typeof fetch);

		const digest = createHash('sha1').update('hunter2').digest('hex').toUpperCase();
		expect(seen.prefix).toBe(digest.slice(0, 5));
		expect(seen.prefix).toHaveLength(5);
	});

	it('fails open when the service errors, so signup is never blocked', async () => {
		const rejecting = async () => {
			throw new Error('network down');
		};
		expect(await countPasswordBreaches('password', rejecting as unknown as typeof fetch)).toBe(0);
	});

	it('fails open on a non-200 response', async () => {
		const failing = async () => new Response('rate limited', { status: 429 });
		expect(await countPasswordBreaches('password', failing as typeof fetch)).toBe(0);
	});
});
