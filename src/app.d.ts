// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Session, User } from '#lib/server/db/schema/identity';

declare global {
	namespace App {
		interface Error {
			message: string;
			/**
			 * Set by `handleError` for unexpected failures, and shown on the error
			 * page. It is the same id that went to the server log, so a user can quote
			 * it and it can be found — `error(400, '…')` thrown deliberately has none.
			 */
			reference?: string;
		}

		interface Locals {
			/** Populated by `hooks.server.ts` when a valid session cookie is present. */
			user: User | null;
			session: Session | null;
		}
	}
}

export {};
