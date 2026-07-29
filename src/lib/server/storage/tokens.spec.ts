import { describe, expect, it } from 'vitest';
import { createFileTokenSigner } from './tokens';

const FILE_ID = '3f1b0a2c-1c4e-4a5f-9c3e-2b7d8e6f0a11';
const signer = createFileTokenSigner('test-secret');

function inMinutes(minutes: number): Date {
	return new Date(Date.now() + minutes * 60_000);
}

describe('file download tokens', () => {
	it('round-trips a valid token', () => {
		const token = signer.sign(FILE_ID, inMinutes(15));
		expect(signer.verify(token)).toBe(FILE_ID);
	});

	it('rejects a token past its expiry', () => {
		const token = signer.sign(FILE_ID, inMinutes(-1));
		expect(signer.verify(token)).toBeNull();
	});

	it('rejects a token signed with a different secret', () => {
		const token = createFileTokenSigner('other-secret').sign(FILE_ID, inMinutes(15));
		expect(signer.verify(token)).toBeNull();
	});

	it('rejects a token whose file id was swapped', () => {
		const token = signer.sign(FILE_ID, inMinutes(15));
		const [, expiry, signature] = token.split('.');
		const forged = `00000000-0000-4000-8000-000000000000.${expiry}.${signature}`;
		expect(signer.verify(forged)).toBeNull();
	});

	it('rejects a token whose expiry was extended', () => {
		const token = signer.sign(FILE_ID, inMinutes(-1));
		const [fileId, , signature] = token.split('.');
		const extended = `${fileId}.${Math.floor(inMinutes(60).getTime() / 1000)}.${signature}`;
		expect(signer.verify(extended)).toBeNull();
	});

	it.each([
		['empty', ''],
		['no separators', 'garbage'],
		['too few parts', `${FILE_ID}.123`],
		['too many parts', `${FILE_ID}.123.sig.extra`],
		['non-numeric expiry', signer.sign(FILE_ID, inMinutes(15)).replace(/\.\d+\./, '.abc.')]
	])('rejects a malformed token (%s)', (_label, token) => {
		expect(signer.verify(token)).toBeNull();
	});
});
