import { desc } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { aiRuns } from '../db/schema/ai';
import { databaseReachable } from '../testing/fixtures';
import { aiConfigured, runAiTask, unavailableReason } from './index';

/**
 * The AI layer, in whichever state this machine is configured.
 *
 * Both halves matter and only one can be true at a time, so each is guarded on
 * the actual configuration rather than mocked. The unconfigured path is the
 * default and the one most deployments will run — it is not a degraded mode to
 * be tested last.
 */
describe.skipIf(!databaseReachable)('running an AI task', () => {
	afterAll(async () => {
		await db.delete(aiRuns);
	});

	describe.skipIf(aiConfigured)('with no provider configured', () => {
		it('says why, in a sentence a person can act on', () => {
			const reason = unavailableReason();

			expect(reason).toBeTruthy();
			// Never a code or a stack. This string is shown on a form.
			expect(reason).toMatch(/AI is/i);
		});

		it('returns unavailable rather than throwing', async () => {
			const result = await runAiTask({ task: 'test' }, async () => {
				throw new Error('should never run');
			});

			// The whole point: a form must keep working when AI is off.
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.unavailable).toBe(true);
		});

		it('records nothing, because nothing ran', async () => {
			const before = await db.select().from(aiRuns);

			await runAiTask({ task: 'test' }, async () => ({ value: 'x' }));

			// A table full of "we did not call anybody" rows would bury the real calls.
			expect(await db.select().from(aiRuns)).toHaveLength(before.length);
		});
	});

	describe.skipIf(!aiConfigured)('with a provider configured', () => {
		it('records a failed call and returns a friendly reason', async () => {
			const result = await runAiTask({ task: 'test_failure' }, async () => {
				// Stands in for the provider refusing — a bad key, a rate limit, an
				// outage. All of them arrive here as a thrown error.
				throw new Error('401 unauthorized');
			});

			expect(result.ok).toBe(false);
			if (!result.ok) {
				// The provider's message is recorded, not shown. "401 unauthorized" on a
				// job form tells the person nothing they can do anything about.
				expect(result.reason).not.toContain('401');
				expect(result.reason).toMatch(/try again/i);
			}

			const [run] = await db.select().from(aiRuns).orderBy(desc(aiRuns.createdAt)).limit(1);

			// Written whether it worked or not — a failure that leaves no trace is
			// indistinguishable from a feature nobody used.
			expect(run.task).toBe('test_failure');
			expect(run.ok).toBe(false);
			expect(run.error).toContain('401');
			expect(run.latencyMs).toBeGreaterThanOrEqual(0);
		});

		it('records a successful call with its usage', async () => {
			const result = await runAiTask({ task: 'test_success' }, async () => ({
				value: 'drafted',
				usage: { inputTokens: 120, outputTokens: 340 }
			}));

			expect(result).toEqual({ ok: true, value: 'drafted' });

			const [run] = await db.select().from(aiRuns).orderBy(desc(aiRuns.createdAt)).limit(1);

			// Tokens are the bill. A feature nobody is counting is one that surprises
			// somebody at the end of a month.
			expect(run.ok).toBe(true);
			expect(run.inputTokens).toBe(120);
			expect(run.outputTokens).toBe(340);
		});
	});
});
