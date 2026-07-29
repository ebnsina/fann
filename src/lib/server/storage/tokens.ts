import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Short-lived tokens proving the bearer was authorized to read a file at the time
 * the link was created.
 *
 * These are *only* for links that leave the session — an offer letter emailed to a
 * candidate, for example. In-app downloads authorize against the session and the
 * `files` row instead, which is strictly stronger because it can be revoked.
 *
 * The secret is a parameter rather than an import so this stays a pure module:
 * testable, and impossible to accidentally use with the wrong key.
 */
export function createFileTokenSigner(secret: string) {
	function hmac(payload: string): string {
		return createHmac('sha256', secret).update(payload).digest('base64url');
	}

	return {
		sign(fileId: string, expiresAt: Date): string {
			const expiry = Math.floor(expiresAt.getTime() / 1000);
			const payload = `${fileId}.${expiry}`;
			return `${payload}.${hmac(payload)}`;
		},

		/** Returns the file id if the token is authentic and unexpired, otherwise null. */
		verify(token: string, now = new Date()): string | null {
			const parts = token.split('.');
			if (parts.length !== 3) return null;

			const [fileId, expiryText, signature] = parts;

			// Verify the signature before looking at the expiry, so response timing
			// cannot be used to learn whether a forged token was otherwise well-formed.
			const provided = Buffer.from(signature);
			const expected = Buffer.from(hmac(`${fileId}.${expiryText}`));
			if (provided.byteLength !== expected.byteLength) return null;
			if (!timingSafeEqual(provided, expected)) return null;

			const expiry = Number(expiryText);
			if (!Number.isFinite(expiry)) return null;
			if (expiry * 1000 <= now.getTime()) return null;

			return fileId;
		}
	};
}

export type FileTokenSigner = ReturnType<typeof createFileTokenSigner>;
