import { error } from '@sveltejs/kit';
import { CRON_SECRET } from '$app/env/private';

/**
 * The guard on every scheduled-job endpoint.
 *
 * These endpoints change what the product tells people — what the market appears
 * to pay, whether an offer is still open. An unguarded one is a way for anyone to
 * drive that, so the check lives here rather than being retyped per route where
 * one of them would eventually be written slightly differently.
 *
 * Denied as not-found rather than unauthorized: the existence of a maintenance
 * endpoint is not something a prober needs confirmed.
 */
export function assertScheduler(request: Request): void {
	// A plain comparison. The timing signal from a string compare is drowned by the
	// network, and this runs a handful of times a day — what matters is that the
	// check exists at all.
	if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
		error(404, 'Not found.');
	}
}
