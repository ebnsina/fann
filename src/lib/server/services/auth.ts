import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '../db';
import { users, type User } from '../db/schema/identity';
import { email as mailer } from '../email';
import { countPasswordBreaches, fakeVerify, hashPassword, verifyPassword } from '../auth/password';
import { invalidateUserSessions } from '../auth/session';
import { consumeEmailToken, issueEmailToken } from '../auth/tokens';

/**
 * Account lifecycle. Remote functions handle validation, rate limiting and cookies;
 * everything below is the business logic, so it stays testable without a request.
 */

export interface SignupInput {
	name: string;
	email: string;
	password: string;
}

/**
 * A password seen in a breach corpus is the one that actually gets stuffed. 10 is a
 * deliberate floor rather than 0 — a handful of hits usually means an unlucky
 * collision with a weak-but-personal password, and blocking those trains people to
 * append `1!` instead of choosing better.
 */
const BREACH_THRESHOLD = 10;

export async function assertPasswordUsable(password: string): Promise<void> {
	if ((await countPasswordBreaches(password)) >= BREACH_THRESHOLD) {
		error(
			400,
			'That password has appeared in a public data breach. Please choose a different one.'
		);
	}
}

export async function signup(input: SignupInput, origin: string): Promise<User> {
	await assertPasswordUsable(input.password);

	const existing = await findByEmail(input.email);
	if (existing) {
		// Do not confirm that the address is registered. Tell the owner instead —
		// if it is really them they get a usable path, and if it is not, the prober
		// learns nothing from the response.
		await sendSignupCollisionNotice(existing, origin);
		return existing;
	}

	const [user] = await db
		.insert(users)
		.values({
			name: input.name,
			email: input.email,
			passwordHash: await hashPassword(input.password)
		})
		.returning();

	await sendVerificationEmail(user, origin);
	return user;
}

/**
 * Verify credentials. Returns null for both "no such account" and "wrong password",
 * and burns the same time in either case — the caller must not tell them apart.
 */
export async function authenticate(email: string, password: string): Promise<User | null> {
	const user = await findByEmail(email);

	if (!user?.passwordHash) {
		await fakeVerify(password);
		return null;
	}

	if (!(await verifyPassword(user.passwordHash, password))) return null;
	if (user.deactivatedAt) return null;

	return user;
}

export async function findByEmail(email: string): Promise<User | undefined> {
	const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
	return user;
}

export async function sendVerificationEmail(user: User, origin: string): Promise<void> {
	const { token } = await issueEmailToken(user.id, 'email_verification');
	const link = `${origin}/verify?token=${token}`;

	await mailer.send({
		to: { email: user.email, name: user.name },
		subject: 'Confirm your email address',
		tag: 'auth.verify_email',
		text: [
			`Hi ${user.name},`,
			'',
			'Confirm your email address to finish setting up your Fann account:',
			link,
			'',
			'This link expires in one hour. If you did not sign up, you can ignore this email.'
		].join('\n')
	});
}

export async function verifyEmail(token: string): Promise<boolean> {
	const userId = await consumeEmailToken(token, 'email_verification');
	if (!userId) return false;

	await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
	return true;
}

/**
 * Always resolves, whether or not the address exists — the caller shows the same
 * "check your inbox" either way, so this endpoint cannot enumerate accounts.
 */
export async function requestPasswordReset(email: string, origin: string): Promise<void> {
	const user = await findByEmail(email);
	if (!user) return;

	const { token } = await issueEmailToken(user.id, 'password_reset');
	const link = `${origin}/reset?token=${token}`;

	await mailer.send({
		to: { email: user.email, name: user.name },
		subject: 'Reset your password',
		tag: 'auth.password_reset',
		text: [
			`Hi ${user.name},`,
			'',
			'Use this link to choose a new password:',
			link,
			'',
			'This link expires in one hour. If you did not request it, nothing has changed.'
		].join('\n')
	});
}

export async function resetPassword(token: string, password: string): Promise<boolean> {
	await assertPasswordUsable(password);

	const userId = await consumeEmailToken(token, 'password_reset');
	if (!userId) return false;

	await db
		.update(users)
		.set({
			passwordHash: await hashPassword(password),
			// Completing a reset proves inbox control, which is the same bar as
			// verification — so a locked-out unverified user is not stuck.
			emailVerifiedAt: new Date()
		})
		.where(eq(users.id, userId));

	// Whoever changed the password keeps their new session; every other device is
	// signed out, which is the point of a reset after a compromise.
	await invalidateUserSessions(userId);
	return true;
}

async function sendSignupCollisionNotice(user: User, origin: string): Promise<void> {
	await mailer.send({
		to: { email: user.email, name: user.name },
		subject: 'Someone tried to sign up with your email',
		tag: 'auth.signup_collision',
		text: [
			`Hi ${user.name},`,
			'',
			'Someone just tried to create a Fann account with this email address, which',
			'already has one. If that was you, sign in instead:',
			`${origin}/login`,
			'',
			'If you have forgotten your password, you can reset it here:',
			`${origin}/reset`
		].join('\n')
	});
}
