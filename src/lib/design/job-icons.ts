import { icons, type IconData } from './icons';

/**
 * Which glyph stands for which job attribute.
 *
 * Lives beside the icon registry rather than in each component, so a job's badges
 * look the same on the board, the detail page, the landing page and the employer
 * table. An icon that means one thing in one place and something else in another
 * is worse than no icon.
 */

const WORK_MODE: Record<string, IconData> = {
	onsite: icons.workOnsite,
	hybrid: icons.workHybrid,
	remote: icons.workRemote
};

const EMPLOYMENT_TYPE: Record<string, IconData> = {
	full_time: icons.jobs,
	part_time: icons.time,
	contract: icons.jobs,
	temporary: icons.time,
	internship: icons.seniority
};

export function workModeIcon(value: string): IconData | undefined {
	return WORK_MODE[value];
}

export function employmentTypeIcon(value: string): IconData | undefined {
	return EMPLOYMENT_TYPE[value];
}

/** Every experience level shares one glyph; the word carries the distinction. */
export function experienceLevelIcon(): IconData {
	return icons.seniority;
}

/** A published response deadline. The clock is the whole point of the badge. */
export function responsePromiseIcon(): IconData {
	return icons.time;
}
