import { createAnthropicChat } from '@tanstack/ai-anthropic';
import { createOpenaiChat } from '@tanstack/ai-openai';
import { AI_MODEL, AI_PROVIDER, ANTHROPIC_API_KEY, OPENAI_API_KEY } from '$app/env/private';
import { db } from '../db';
import { aiRuns } from '../db/schema/ai';

/**
 * The one place a language model is reached.
 *
 * Provider-agnostic on purpose: which model runs is deployment configuration,
 * and the features above should only know that a result arrived. Adapters are
 * built once at module load rather than per request — constructing one per call
 * is a documented way to leak connections.
 *
 * The key is passed explicitly rather than using the library's `anthropicText`
 * and `openaiText` helpers, which read `process.env` themselves. Everything in
 * this codebase reads configuration through the validated `src/env.ts`, and a
 * second path that quietly works when that one is empty is how a deployment ends
 * up in a state nobody can explain.
 *
 * **Every feature here has a path that does not need a model**, and "no provider
 * configured" is a supported way to run this product rather than a broken state.
 * That is why `unavailable()` returns a reason instead of throwing: the interface
 * has to be able to say "this is not switched on" in a sentence a person
 * understands, not show a spinner that never resolves.
 */

/** How long a single call may take before we stop waiting. */
const TIMEOUT_MS = 30_000;

const DEFAULT_MODELS = {
	anthropic: 'claude-sonnet-5',
	openai: 'gpt-5.2'
} as const;

export type AiProvider = 'anthropic' | 'openai';

/** Why AI is off, or null when it is on. Phrased for a person, not a log. */
export function unavailableReason(): string | null {
	if (!AI_PROVIDER) return 'AI is not switched on for this deployment.';

	const key = AI_PROVIDER === 'anthropic' ? ANTHROPIC_API_KEY : OPENAI_API_KEY;
	if (!key) {
		// Named explicitly. Somebody who set the provider and not the key is one
		// line from working, and "not configured" alone does not say which line.
		const variable = AI_PROVIDER === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
		return `AI is set to ${AI_PROVIDER} but ${variable} is missing.`;
	}

	return null;
}

export const aiConfigured = unavailableReason() === null;

const provider = (AI_PROVIDER || null) as AiProvider | null;
const model = AI_MODEL || (provider ? DEFAULT_MODELS[provider] : '');

/**
 * The adapter, built once.
 *
 * Null when nothing is configured, so the absence is a value the callers can
 * check rather than an exception thrown from module scope — importing this file
 * must never be what takes the app down.
 */
/*
 * The adapters type their model argument as a union of ids they know about, and
 * `AI_MODEL` is a string somebody put in an environment file. The cast is
 * deliberate: keeping our own copy of each provider's model list would go stale
 * the week either of them ships something, and an unknown id is rejected by the
 * provider at call time — which surfaces as a recorded run failure carrying their
 * message, rather than a build error carrying ours.
 */
const adapter = !provider
	? null
	: provider === 'anthropic'
		? createAnthropicChat(model as Parameters<typeof createAnthropicChat>[0], ANTHROPIC_API_KEY)
		: createOpenaiChat(model as Parameters<typeof createOpenaiChat>[0], OPENAI_API_KEY);

/** The adapter, once it is known to exist. Callers get this, never the nullable. */
export type Adapter = NonNullable<typeof adapter>;

export interface RunContext {
	task: string;
	organizationId?: string | null;
	userId?: string | null;
}

export type AiResult<T> =
	{ ok: true; value: T } | { ok: false; reason: string; unavailable?: boolean };

/**
 * Run one task against the model, and record that it happened.
 *
 * The `ai_runs` row is written whether the call worked or not, and written
 * before the caller sees anything — a failure that leaves no trace is
 * indistinguishable from a feature nobody used.
 *
 * Never throws. Every AI feature here is an assist on top of something a person
 * can do themselves, so the honest failure mode is "that did not work, carry on"
 * rather than an error page over a form somebody had half filled in.
 */
export async function runAiTask<T>(
	context: RunContext,
	run: (adapter: Adapter) => Promise<{ value: T; usage?: Usage }>
): Promise<AiResult<T>> {
	const reason = unavailableReason();
	if (reason || !adapter) {
		// Deliberately not recorded: nothing ran, and a table of "we did not call
		// anybody" rows would bury the calls that did.
		return { ok: false, reason: reason ?? 'AI is not available.', unavailable: true };
	}

	const startedAt = Date.now();

	try {
		const outcome = await withTimeout(run(adapter), TIMEOUT_MS);

		await record(context, {
			ok: true,
			latencyMs: Date.now() - startedAt,
			inputTokens: outcome.usage?.inputTokens ?? null,
			outputTokens: outcome.usage?.outputTokens ?? null
		});

		return { ok: true, value: outcome.value };
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : 'Unknown error';

		await record(context, {
			ok: false,
			error: message.slice(0, 500),
			latencyMs: Date.now() - startedAt
		});

		return { ok: false, reason: 'The model could not be reached. Try again in a moment.' };
	}
}

interface Usage {
	inputTokens?: number;
	outputTokens?: number;
}

async function record(
	context: RunContext,
	row: {
		ok: boolean;
		error?: string;
		latencyMs: number;
		inputTokens?: number | null;
		outputTokens?: number | null;
	}
): Promise<void> {
	try {
		await db.insert(aiRuns).values({
			task: context.task,
			provider: provider ?? 'none',
			model,
			organizationId: context.organizationId ?? null,
			userId: context.userId ?? null,
			ok: row.ok,
			error: row.error ?? null,
			inputTokens: row.inputTokens ?? null,
			outputTokens: row.outputTokens ?? null,
			latencyMs: row.latencyMs
		});
	} catch (cause) {
		// The audit row failing must not take the feature down with it — the same
		// reasoning as `deliver` in notifications.
		console.error('Could not record an AI run', cause);
	}
}

/**
 * A hard ceiling on how long we wait.
 *
 * The adapter has its own timeouts, but they are the provider's opinion. This is
 * ours, and it is what stops a form sitting on a spinner because somebody else's
 * service is having a bad afternoon.
 */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
	return Promise.race([
		work,
		new Promise<never>((unused, reject) =>
			setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
		)
	]);
}
