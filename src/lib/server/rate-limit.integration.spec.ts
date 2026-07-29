import { like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from './db';
import { rateLimits } from './db/schema/platform';
import { RULES, consume, enforce, reset } from './rate-limit';

const reachable = await db
	.execute('select 1')
	.then(() => true)
	.catch(() => false);

describe.skipIf(!reachable)('rate limiting', () => {
	afterAll(async () => {
		await db.delete(rateLimits).where(like(rateLimits.key, '%rl-test-%'));
	});

	function subject(): string {
		return `rl-test-${crypto.randomUUID()}`;
	}

	it('allows up to the limit and blocks past it', async () => {
		const who = subject();
		const rule = { action: 'rl-test-basic', limit: 3, windowMs: 60_000 };

		expect((await consume(rule, who)).allowed).toBe(true);
		expect((await consume(rule, who)).allowed).toBe(true);
		expect((await consume(rule, who)).allowed).toBe(true);
		expect((await consume(rule, who)).allowed).toBe(false);
	});

	it('reports how many attempts remain', async () => {
		const who = subject();
		const rule = { action: 'rl-test-remaining', limit: 3, windowMs: 60_000 };

		expect((await consume(rule, who)).remaining).toBe(2);
		expect((await consume(rule, who)).remaining).toBe(1);
		expect((await consume(rule, who)).remaining).toBe(0);
	});

	it('counts subjects independently', async () => {
		const rule = { action: 'rl-test-isolation', limit: 1, windowMs: 60_000 };
		const a = subject();
		const b = subject();

		expect((await consume(rule, a)).allowed).toBe(true);
		expect((await consume(rule, a)).allowed).toBe(false);
		// b must be untouched by a's exhaustion.
		expect((await consume(rule, b)).allowed).toBe(true);
	});

	it('starts a fresh window once the old one has passed', async () => {
		const who = subject();
		// A zero-length window is always expired, which is the cheapest way to prove
		// the reset branch runs without sleeping in a test.
		const rule = { action: 'rl-test-window', limit: 1, windowMs: 0 };

		expect((await consume(rule, who)).allowed).toBe(true);
		expect((await consume(rule, who)).allowed).toBe(true);
	});

	it('does not race: concurrent consumes are counted exactly once each', async () => {
		const who = subject();
		const rule = { action: 'rl-test-race', limit: 100, windowMs: 60_000 };

		await Promise.all(Array.from({ length: 20 }, () => consume(rule, who)));

		const [row] = await db
			.select()
			.from(rateLimits)
			.where(like(rateLimits.key, `%${who}`));
		expect(row.count).toBe(20);
	});

	it('enforce throws once exhausted and stays quiet before that', async () => {
		const who = subject();
		const rule = { action: 'rl-test-enforce', limit: 2, windowMs: 60_000 };

		await expect(enforce(rule, [who])).resolves.toBeUndefined();
		await expect(enforce(rule, [who])).resolves.toBeUndefined();
		await expect(enforce(rule, [who])).rejects.toMatchObject({ status: 429 });
	});

	it('enforce blocks when any one subject is exhausted', async () => {
		const rule = { action: 'rl-test-multi', limit: 1, windowMs: 60_000 };
		const ip = subject();
		const account = subject();

		await enforce(rule, [ip, account]);
		// The IP is now spent, so the pair is blocked even though the account is fresh.
		await expect(enforce(rule, [ip, subject()])).rejects.toMatchObject({ status: 429 });
	});

	it('reset clears a counter, so a successful login forgives earlier failures', async () => {
		const who = subject();
		const rule = { action: 'rl-test-reset', limit: 1, windowMs: 60_000 };

		await consume(rule, who);
		expect((await consume(rule, who)).allowed).toBe(false);

		await reset(rule, who);
		expect((await consume(rule, who)).allowed).toBe(true);
	});

	it('the real login rule is configured for a sane window', () => {
		expect(RULES.login.limit).toBeGreaterThan(0);
		expect(RULES.login.windowMs).toBeGreaterThan(0);
	});
});
