/**
 * Installs the Postgres extensions the schema depends on.
 *
 * Extensions are not part of the Drizzle migration graph — `drizzle-kit generate`
 * only diffs tables — so they are applied here, before `db:migrate`. Every
 * statement is `IF NOT EXISTS`, so this is safe to run repeatedly.
 *
 * Run via `pnpm db:setup`.
 */
import postgres from 'postgres';

process.loadEnvFile?.('.env');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const EXTENSIONS = [
	// gen_random_uuid() for every primary key
	'pgcrypto',
	// trigram fuzzy matching — typo-tolerant job title and company autocomplete
	'pg_trgm',
	// pgvector — semantic job↔candidate matching
	'vector',
	// accent-insensitive search, so "Zurich" finds "Zürich"
	'unaccent'
] as const;

const sql = postgres(url, { max: 1 });

try {
	for (const extension of EXTENSIONS) {
		await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS "${extension}"`);
		console.log(`✓ ${extension}`);
	}
} catch (error) {
	console.error('Failed to install extensions.');
	if (error instanceof Error && /permission denied/i.test(error.message)) {
		console.error(
			'The database user needs superuser or `rds_superuser` rights to create extensions.\n' +
				'On a managed host, enable them from the provider console instead.'
		);
	}
	throw error;
} finally {
	await sql.end();
}
