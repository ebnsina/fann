import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';

/**
 * Render employer- and candidate-supplied markdown to safe HTML.
 *
 * Sanitization is not optional and not a caller's responsibility: job descriptions
 * are written by strangers and rendered to every visitor, so unsanitized `{@html}`
 * here would be stored XSS on the most-visited page in the product. The only way to
 * get markdown onto a page is through this function.
 */

marked.setOptions({
	gfm: true,
	// Markdown newlines become <br>, matching what people expect from a textarea.
	breaks: true
});

/**
 * Deliberately narrow. Formatting an employer needs for a job post — nothing that
 * loads, scripts, styles or embeds.
 */
const ALLOWED_TAGS = [
	// Required. With `KEEP_CONTENT: false`, DOMPurify drops every node absent from
	// this list — text nodes included — so omitting `#text` renders empty elements
	// and silently blanks every description.
	'#text',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'p',
	'br',
	'hr',
	'strong',
	'em',
	'del',
	'code',
	'pre',
	'blockquote',
	'ul',
	'ol',
	'li',
	'a',
	'table',
	'thead',
	'tbody',
	'tr',
	'th',
	'td'
];

const ALLOWED_ATTR = ['href', 'title'];

export function renderMarkdown(source: string | null | undefined): string {
	if (!source) return '';

	const html = marked.parse(source, { async: false });

	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS,
		ALLOWED_ATTR,
		// Block `javascript:` and `data:` URLs while still allowing normal links.
		ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
		// Strip the tag *and* its contents for anything not on the list, so a
		// `<script>` body cannot leak through as visible text.
		KEEP_CONTENT: false
	});
}

/** Plain text for meta descriptions and search snippets. */
export function markdownToText(source: string | null | undefined, maxLength = 200): string {
	if (!source) return '';

	const text = DOMPurify.sanitize(marked.parse(source, { async: false }), {
		ALLOWED_TAGS: [],
		KEEP_CONTENT: true
	})
		.replace(/\s+/g, ' ')
		.trim();

	if (text.length <= maxLength) return text;
	// Cut on a word boundary rather than mid-word.
	return `${text.slice(0, text.lastIndexOf(' ', maxLength))}…`;
}
