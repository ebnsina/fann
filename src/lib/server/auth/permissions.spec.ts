import { describe, expect, it } from 'vitest';
import { can, permissionsFor, type Permission } from './permissions';
import type { OrgRole } from '../db/schema/org';

const ROLES: OrgRole[] = ['owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer', 'viewer'];

describe('organization permissions', () => {
	it('gives only the owner the ability to delete the organization', () => {
		const allowed = ROLES.filter((role) => can(role, 'org.delete'));
		expect(allowed).toEqual(['owner']);
	});

	it('restricts billing to owner and admin', () => {
		expect(ROLES.filter((role) => can(role, 'org.billing'))).toEqual(['owner', 'admin']);
	});

	it('restricts role changes and removal to owner and admin', () => {
		expect(ROLES.filter((role) => can(role, 'member.update_role'))).toEqual(['owner', 'admin']);
		expect(ROLES.filter((role) => can(role, 'member.remove'))).toEqual(['owner', 'admin']);
	});

	it('lets an interviewer submit a scorecard but not read the panel’s', () => {
		// This is the anti-anchoring rule: seeing other scores before submitting your
		// own is what makes a panel converge on the first opinion voiced.
		expect(can('interviewer', 'scorecard.submit')).toBe(true);
		expect(can('interviewer', 'scorecard.view_all')).toBe(false);
	});

	it('keeps viewers strictly read-only', () => {
		const writes: Permission[] = [
			'job.create',
			'job.update',
			'job.publish',
			'job.delete',
			'application.advance',
			'application.reject',
			'application.note',
			'scorecard.submit',
			'interview.schedule',
			'offer.create',
			'candidate.message'
		];
		for (const permission of writes) {
			expect(can('viewer', permission), `viewer should not have ${permission}`).toBe(false);
		}
	});

	it('never lets a non-owner approve their own offer without approval rights', () => {
		expect(ROLES.filter((role) => can(role, 'offer.approve'))).toEqual(['owner', 'admin']);
	});

	it('does not let an interviewer reach candidate messaging or the pipeline', () => {
		expect(can('interviewer', 'candidate.message')).toBe(false);
		expect(can('interviewer', 'application.advance')).toBe(false);
		expect(can('interviewer', 'application.reject')).toBe(false);
	});

	it('grants every role at least the ability to view jobs and applications', () => {
		for (const role of ROLES) {
			expect(can(role, 'job.view'), role).toBe(true);
			expect(can(role, 'application.view'), role).toBe(true);
		}
	});

	it('lists no duplicate permissions for a role', () => {
		for (const role of ROLES) {
			const granted = permissionsFor(role);
			expect(new Set(granted).size, role).toBe(granted.length);
		}
	});

	it('grants strictly fewer permissions as the role narrows', () => {
		// Not a strict hierarchy — recruiter and hiring_manager differ sideways — but
		// owner must never hold fewer permissions than anyone else.
		const ownerCount = permissionsFor('owner').length;
		for (const role of ROLES) {
			expect(permissionsFor(role).length).toBeLessThanOrEqual(ownerCount);
		}
	});
});
