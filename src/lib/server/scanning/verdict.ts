/**
 * The verdict type, in its own module.
 *
 * Drivers need it and `index.ts` imports the drivers, so keeping it here is what
 * stops that being a cycle.
 */
export type ScanVerdict = 'clean' | 'infected' | 'failed';
