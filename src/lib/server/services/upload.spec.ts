import { describe, expect, it } from 'vitest';
import { looksLikeDeclaredType } from './upload';

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC = 'application/msword';

function bytes(...values: number[]): Uint8Array {
	return new Uint8Array([...values, ...Array(32).fill(0)]);
}

/**
 * The browser-supplied MIME type is attacker-controlled, so this check is the only
 * thing standing between "candidate uploaded a resume" and "employer downloaded an
 * executable that claimed to be one".
 */
describe('looksLikeDeclaredType', () => {
	it('accepts a real PDF', () => {
		expect(looksLikeDeclaredType(bytes(0x25, 0x50, 0x44, 0x46), PDF)).toBe(true);
	});

	it('accepts a real docx (a zip container)', () => {
		expect(looksLikeDeclaredType(bytes(0x50, 0x4b, 0x03, 0x04), DOCX)).toBe(true);
	});

	it('accepts a real legacy .doc', () => {
		expect(looksLikeDeclaredType(bytes(0xd0, 0xcf, 0x11, 0xe0), DOC)).toBe(true);
	});

	it.each([
		['a Windows executable', [0x4d, 0x5a]],
		['an ELF binary', [0x7f, 0x45, 0x4c, 0x46]],
		['a shell script', [0x23, 0x21, 0x2f, 0x62]],
		['a PNG', [0x89, 0x50, 0x4e, 0x47]],
		['an HTML document', [0x3c, 0x68, 0x74, 0x6d]],
		['a bare zip claiming to be a PDF', [0x50, 0x4b, 0x03, 0x04]]
	])('rejects %s renamed to .pdf', (_label, signature) => {
		expect(looksLikeDeclaredType(bytes(...signature), PDF)).toBe(false);
	});

	it('rejects a PDF claiming to be a Word document', () => {
		expect(looksLikeDeclaredType(bytes(0x25, 0x50, 0x44, 0x46), DOCX)).toBe(false);
	});

	it('rejects an empty file', () => {
		expect(looksLikeDeclaredType(new Uint8Array(), PDF)).toBe(false);
	});

	it('rejects a file shorter than the signature it claims', () => {
		expect(looksLikeDeclaredType(new Uint8Array([0x25, 0x50]), PDF)).toBe(false);
	});

	it('accepts plain text, which has no signature to check', () => {
		expect(looksLikeDeclaredType(new TextEncoder().encode('Ada Lovelace'), 'text/plain')).toBe(
			true
		);
	});

	it('rejects a type that is not on the list at all', () => {
		expect(looksLikeDeclaredType(bytes(0x25, 0x50, 0x44, 0x46), 'application/x-msdownload')).toBe(
			false
		);
	});
});
