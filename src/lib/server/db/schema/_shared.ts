import { sql } from 'drizzle-orm';
import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Postgres `tsvector`, which Drizzle has no built-in type for.
 *
 * Declaring it as `text` compiles but the migration fails — a generated column
 * whose expression yields tsvector cannot live in a text column.
 */
export const tsvector = customType<{ data: string; driverData: string }>({
	dataType: () => 'tsvector'
});

/**
 * `vector(n)` from pgvector, for the semantic search landing in Phase 5. Declared
 * here so the extension and the type live alongside the other conventions.
 */
export const vector = customType<{
	data: number[];
	driverData: string;
	config: { dimensions: number };
}>({
	dataType: (config) => `vector(${config?.dimensions ?? 1536})`,
	toDriver: (value: number[]) => JSON.stringify(value),
	fromDriver: (value: string) => JSON.parse(value) as number[]
});

/**
 * Column conventions every table in this schema follows.
 *
 * Spreading these rather than repeating the definitions keeps the defaults
 * (uuid v4 server-side, timestamptz, `updatedAt` maintained by the ORM) identical
 * across ~60 tables — a difference in any one of them is a bug you find in
 * production, not in review.
 */

/** Server-generated uuid primary key. Requires the `pgcrypto` extension. */
export const primaryKeyColumn = {
	id: uuid('id')
		.primaryKey()
		.default(sql`gen_random_uuid()`)
};

/** Creation and modification stamps. `updatedAt` is bumped by Drizzle on update. */
export const timestampColumns = {
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
};

/**
 * Soft delete, for rows a user can see and might need restored (jobs,
 * applications, profiles). Every query against such a table must filter on
 * `isNull(deletedAt)` — use the `notDeleted()` helper in the services layer.
 */
export const softDeleteColumn = {
	deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' })
};

/** The common case: uuid pk + timestamps. */
export const baseColumns = {
	...primaryKeyColumn,
	...timestampColumns
};

/** Base columns plus soft delete. */
export const baseSoftDeleteColumns = {
	...baseColumns,
	...softDeleteColumn
};
