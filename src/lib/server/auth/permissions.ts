import type { OrgRole } from '../db/schema/org';

/**
 * Every action that can be authorized inside an organization.
 *
 * Named after what the user is doing, not the table being touched, so the check
 * reads the same as the product requirement: `can(role, 'job.publish')`.
 */
export type Permission =
	| 'org.update'
	| 'org.delete'
	| 'org.billing'
	| 'member.invite'
	| 'member.update_role'
	| 'member.remove'
	| 'job.view'
	| 'job.create'
	| 'job.update'
	| 'job.publish'
	| 'job.delete'
	| 'application.view'
	| 'application.advance'
	| 'application.reject'
	| 'application.note'
	/** Editing the board's columns — renaming, adding, reordering, deleting. */
	| 'pipeline.manage'
	| 'scorecard.submit'
	| 'scorecard.view_all'
	| 'interview.schedule'
	| 'offer.create'
	| 'offer.approve'
	| 'candidate.message';

/**
 * Role → permissions, stated explicitly rather than derived from a rank order.
 *
 * A table is longer than `rank >= X` but it is auditable: you can read off exactly
 * what an interviewer can do, and adding a permission forces a decision for every
 * role instead of silently granting it to everyone above a threshold.
 */
const GRANTS: Record<OrgRole, readonly Permission[]> = {
	owner: [
		'org.update',
		'org.delete',
		'org.billing',
		'member.invite',
		'member.update_role',
		'member.remove',
		'job.view',
		'job.create',
		'job.update',
		'job.publish',
		'job.delete',
		'application.view',
		'application.advance',
		'application.reject',
		'application.note',
		'pipeline.manage',
		'scorecard.submit',
		'scorecard.view_all',
		'interview.schedule',
		'offer.create',
		'offer.approve',
		'candidate.message'
	],
	admin: [
		'org.update',
		'org.billing',
		'member.invite',
		'member.update_role',
		'member.remove',
		'job.view',
		'job.create',
		'job.update',
		'job.publish',
		'job.delete',
		'application.view',
		'application.advance',
		'application.reject',
		'application.note',
		'pipeline.manage',
		'scorecard.submit',
		'scorecard.view_all',
		'interview.schedule',
		'offer.create',
		'offer.approve',
		'candidate.message'
	],
	recruiter: [
		'member.invite',
		'job.view',
		'job.create',
		'job.update',
		'job.publish',
		'application.view',
		'application.advance',
		'application.reject',
		'application.note',
		'pipeline.manage',
		'scorecard.submit',
		'scorecard.view_all',
		'interview.schedule',
		'offer.create',
		'candidate.message'
	],
	// A hiring manager works inside the process; owners, admins and recruiters are
	// the ones who get to change what the process *is*.
	hiring_manager: [
		'job.view',
		'job.create',
		'job.update',
		'application.view',
		'application.advance',
		'application.reject',
		'application.note',
		'scorecard.submit',
		'scorecard.view_all',
		'interview.schedule',
		'offer.create',
		'candidate.message'
	],
	// Interviewers see the candidates they are assessing and submit their own
	// scorecard, but cannot read other interviewers' scores before submitting —
	// that is what stops the panel anchoring on the first opinion.
	interviewer: ['job.view', 'application.view', 'application.note', 'scorecard.submit'],
	viewer: ['job.view', 'application.view']
};

export function can(role: OrgRole, permission: Permission): boolean {
	return GRANTS[role].includes(permission);
}

/** Every permission a role holds — for rendering UI without a check per element. */
export function permissionsFor(role: OrgRole): readonly Permission[] {
	return GRANTS[role];
}
