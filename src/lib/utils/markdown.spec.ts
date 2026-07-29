import { describe, expect, it } from 'vitest';
import { markdownToText, renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
	it('renders the formatting a job description needs', () => {
		const html = renderMarkdown('## Role\n\n- One\n- Two\n\n**Bold** and _italic_.');

		expect(html).toContain('<h2>Role</h2>');
		expect(html).toContain('<li>One</li>');
		expect(html).toContain('<strong>Bold</strong>');
		expect(html).toContain('<em>italic</em>');
	});

	it('keeps links but drops other attributes', () => {
		const html = renderMarkdown('[Careers](https://example.com "Our page")');

		expect(html).toContain('href="https://example.com"');
		expect(html).toContain('title="Our page"');
	});

	it('returns an empty string for nullish input', () => {
		expect(renderMarkdown(null)).toBe('');
		expect(renderMarkdown(undefined)).toBe('');
		expect(renderMarkdown('')).toBe('');
	});

	/**
	 * Job descriptions are written by strangers and rendered to every visitor, so
	 * each of these is a stored-XSS attempt that must not survive.
	 */
	describe('sanitization', () => {
		it.each([
			['script tag', '<script>alert(1)</script>'],
			['img onerror', '<img src=x onerror="alert(1)">'],
			['svg onload', '<svg onload="alert(1)"></svg>'],
			['iframe', '<iframe src="https://evil.test"></iframe>'],
			['inline event handler', '<p onclick="alert(1)">click</p>'],
			['style tag', '<style>body{display:none}</style>'],
			['object embed', '<object data="evil.swf"></object>'],
			['form', '<form action="https://evil.test"><input name="password"></form>'],
			['meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.test">']
		])('strips %s', (_label, payload) => {
			const html = renderMarkdown(payload);

			expect(html).not.toMatch(/<script|<iframe|<style|<object|<form|<meta/i);
			expect(html).not.toMatch(/onerror=|onload=|onclick=|http-equiv/i);
		});

		it.each([
			['javascript URL', '[click](javascript:alert(1))'],
			['data URL', '[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'],
			['vbscript URL', '[click](vbscript:msgbox(1))']
		])('refuses a %s in a link', (_label, payload) => {
			const html = renderMarkdown(payload);
			expect(html).not.toMatch(/javascript:|data:text\/html|vbscript:/i);
		});

		it('does not leak script contents as visible text', () => {
			// KEEP_CONTENT: false is what makes this true — otherwise the payload
			// reappears as body copy on the page.
			expect(renderMarkdown('<script>alert("pwned")</script>')).not.toContain('pwned');
		});

		it('keeps ordinary links working', () => {
			for (const url of ['https://a.test', 'http://a.test', 'mailto:a@b.test', '/jobs', '#top']) {
				expect(renderMarkdown(`[x](${url})`)).toContain(`href="${url}"`);
			}
		});
	});
});

describe('markdownToText', () => {
	it('strips markup down to plain text', () => {
		expect(markdownToText('## Title\n\n**Bold** text.')).toBe('Title Bold text.');
	});

	it('truncates on a word boundary', () => {
		const text = markdownToText('one two three four five six seven eight', 20);

		expect(text.endsWith('…')).toBe(true);
		// Every retained word must be whole — no "fou…" mid-word cuts.
		const words = text.slice(0, -1).split(' ');
		const original = 'one two three four five six seven eight'.split(' ');
		expect(original.slice(0, words.length)).toEqual(words);
	});

	it('leaves short text untouched', () => {
		expect(markdownToText('Short.', 200)).toBe('Short.');
	});

	it('does not carry script content into a meta description', () => {
		expect(markdownToText('<script>alert("pwned")</script>Real copy.')).not.toContain('pwned');
	});
});
