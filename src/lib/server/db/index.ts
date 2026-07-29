import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { DATABASE_URL } from '$app/env/private';
import { isProduction } from '../runtime';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

/**
 * The connection pool, cached across hot reloads.
 *
 * This module holds a pool at module scope, and Vite replaces the module whenever
 * anything it imports changes. Without the cache, every reload built a fresh pool
 * and abandoned the previous one: the old sockets stay open, Postgres keeps the
 * backends, and after an afternoon's editing the server refuses new connections
 * with `53300: sorry, too many clients already`. It shows up as unrelated query
 * failures in whatever ran next — usually the test suite, which is why it looks
 * like a flake rather than a leak.
 *
 * Stashing the pool on `globalThis` survives module replacement, so one session
 * reuses one pool however many times this file reloads. Production never
 * hot-reloads and gets a plain module-scope client.
 */
declare global {
	var __fannPool: ReturnType<typeof postgres> | undefined;
}

function createPool() {
	return postgres(DATABASE_URL, {
		/**
		 * `prepare: false` because connection poolers (PgBouncer in transaction mode,
		 * Supabase's pooler, Neon) reject prepared statements. Remove it only if the
		 * deployment is known to talk to Postgres directly.
		 */
		prepare: false,
		/**
		 * postgres.js's own default, stated rather than left implicit: it is half the
		 * connection budget, and the other half — how many processes there are — is
		 * what actually exhausts a local Postgres capped at 100.
		 */
		max: 10,
		/** Hand a connection back rather than holding it open all afternoon. */
		idle_timeout: 30
	});
}

const client = isProduction ? createPool() : (globalThis.__fannPool ??= createPool());

export const db = drizzle(client, { schema });

export type Database = typeof db;
export { schema };
