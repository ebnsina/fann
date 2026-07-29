/**
 * Schema barrel. `drizzle.config.ts` and the db client both point here, so a new
 * domain schema is only wired up once it is re-exported below.
 *
 * Domain files land with their phase:
 *   identity, org      → Phase 1
 *   company, job       → Phase 2
 *   candidate          → Phase 3
 *   application, ats   → Phase 3–4
 *   ai, salary, trust  → Phase 5–7
 *   billing            → Phase 8
 */
export * from './identity';
export * from './org';
export * from './taxonomy';
export * from './company';
export * from './job';
export * from './candidate';
export * from './application';
export * from './ats';
export * from './salary';
export * from './social';
export * from './ai';
export * from './notification';
export * from './platform';
