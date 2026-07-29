import { describe, expect, it } from 'vitest';
import { allowedMimeTypes, buildStorageKey, isAllowedMimeType } from './keys';

describe('storage keys', () => {
	it('partitions by scope and UTC year/month', () => {
		const key = buildStorageKey('resumes', 'application/pdf', new Date('2026-01-09T12:00:00Z'));
		expect(key).toMatch(/^resumes\/2026\/01\/[0-9a-f-]{36}\.pdf$/);
	});

	it('derives the extension from the content type, not the filename', () => {
		const key = buildStorageKey(
			'documents',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		);
		expect(key.endsWith('.docx')).toBe(true);
	});

	it('produces a distinct key every time for the same inputs', () => {
		const at = new Date('2026-07-28T00:00:00Z');
		const keys = new Set(
			Array.from({ length: 50 }, () => buildStorageKey('resumes', 'application/pdf', at))
		);
		expect(keys.size).toBe(50);
	});

	it('rejects content types outside the allowlist', () => {
		expect(() => buildStorageKey('attachments', 'application/x-msdownload')).toThrow(
			/Unsupported content type/
		);
		expect(isAllowedMimeType('application/x-msdownload')).toBe(false);
	});

	it('does not allow SVG, which can carry script when served inline', () => {
		expect(isAllowedMimeType('image/svg+xml')).toBe(false);
		expect(allowedMimeTypes()).not.toContain('image/svg+xml');
	});
});
