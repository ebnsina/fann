/**
 * Display formatting shared across the product.
 *
 * Centralised because salary is the thing this product is opinionated about —
 * every listing shows one, so it must read identically everywhere.
 */

const COMPACT = new Map<string, Intl.NumberFormat>();

function compactFormatter(currency: string): Intl.NumberFormat {
	let formatter = COMPACT.get(currency);
	if (!formatter) {
		formatter = new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency,
			notation: 'compact',
			maximumFractionDigits: 0
		});
		COMPACT.set(currency, formatter);
	}
	return formatter;
}

const PERIOD_SUFFIX: Record<string, string> = {
	hour: '/hr',
	day: '/day',
	month: '/mo',
	year: ''
};

/**
 * "$140K" — one figure, same rounding as the ranges beside it.
 *
 * Exported because three pages were each constructing their own
 * `Intl.NumberFormat` with the same options, which is how "$140K" and "$140,000"
 * end up on the same screen.
 */
export function formatCompactCurrency(value: number, currency = 'USD'): string {
	return compactFormatter(currency).format(value);
}

/**
 * "$140K – $195K" — compact because it sits in a dense list, and a range is more
 * honest than the single midpoint most boards show.
 */
export function formatSalaryRange(
	min: number,
	max: number,
	currency = 'USD',
	period = 'year'
): string {
	const format = compactFormatter(currency);
	const suffix = PERIOD_SUFFIX[period] ?? '';

	if (min === max) return `${format.format(min)}${suffix}`;
	return `${format.format(min)} – ${format.format(max)}${suffix}`;
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const DIVISIONS: [number, Intl.RelativeTimeFormatUnit][] = [
	[60, 'second'],
	[60, 'minute'],
	[24, 'hour'],
	[7, 'day'],
	[4.34524, 'week'],
	[12, 'month'],
	[Number.POSITIVE_INFINITY, 'year']
];

/** "3 days ago". `now` is injectable so this is testable without freezing time. */
export function formatRelativeTime(date: Date | string | null, now = new Date()): string {
	if (!date) return '';

	const value = typeof date === 'string' ? new Date(date) : date;
	let duration = (value.getTime() - now.getTime()) / 1000;

	for (const [amount, unit] of DIVISIONS) {
		if (Math.abs(duration) < amount) return RELATIVE.format(Math.round(duration), unit);
		duration /= amount;
	}

	return RELATIVE.format(Math.round(duration), 'year');
}

const LABELS: Record<string, string> = {
	onsite: 'On-site',
	hybrid: 'Hybrid',
	remote: 'Remote',
	full_time: 'Full-time',
	part_time: 'Part-time',
	contract: 'Contract',
	temporary: 'Temporary',
	internship: 'Internship',
	entry: 'Entry level',
	mid: 'Mid level',
	senior: 'Senior',
	staff: 'Staff',
	principal: 'Principal',
	executive: 'Executive'
};

/** Turn an enum value into something a person would say. */
export function label(value: string): string {
	return LABELS[value] ?? value.replace(/_/g, ' ');
}
