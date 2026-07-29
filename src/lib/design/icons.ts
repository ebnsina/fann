/**
 * Icon registry — the single source of truth for iconography.
 *
 * Components import `icons.search`, never a library symbol directly. Swapping icon
 * sets (or replacing one glyph) is an edit to this file alone; nothing downstream
 * knows which library the shapes came from.
 *
 * Names describe the *role* the icon plays, not the picture. `icons.sortAscending`
 * survives a redesign that changes which arrow is used; `icons.arrowUp01` does not.
 * If you find yourself rotating an icon to mean something else, add an entry here
 * instead — a `-rotate-90` chevron is a missing token, not a style.
 *
 * Source: Hugeicons (free set). Rendered by `#lib/components/ui/Icon.svelte`, which
 * draws the shapes during SSR — the official `@hugeicons/svelte` component injects
 * them on mount, so icons would be absent from server HTML and pop in on hydration.
 */
import {
	Add01Icon,
	Agreement02Icon,
	BadgeCheckIcon,
	Alert02Icon,
	Analytics01Icon,
	Archive02Icon,
	ArrowDown01Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	ArrowRight02Icon,
	ArrowUp01Icon,
	ArrowUpDownIcon,
	ArrowUpRight01Icon,
	Bookmark02Icon,
	Briefcase01Icon,
	Building03Icon,
	Calendar03Icon,
	BellRingIcon,
	Cancel01Icon,
	ChartUpIcon,
	CheckmarkCircle01Icon,
	Clock01Icon,
	ComputerIcon,
	Award01Icon,
	File02Icon,
	FilterIcon,
	FlashIcon,
	GlobalIcon,
	HandshakeIcon,
	HelpCircleIcon,
	KanbanIcon,
	LockIcon,
	QuoteDownIcon,
	Rocket01Icon,
	SecurityCheckIcon,
	ShuffleIcon,
	Target01Icon,
	Delete02Icon,
	Edit02Icon,
	FavouriteIcon,
	EyeIcon,
	InboxIcon,
	InformationCircleIcon,
	Location01Icon,
	Logout01Icon,
	Mail01Icon,
	MailAdd01Icon,
	MinusSignIcon,
	Moon02Icon,
	MoneyBag01Icon,
	MoreHorizontalIcon,
	PaintBrush02Icon,
	Search01Icon,
	Settings02Icon,
	SmileIcon,
	Sun01Icon,
	Tag01Icon,
	Tick02Icon,
	Upload01Icon,
	UserAccountIcon,
	UserAdd01Icon,
	UserGroupIcon
} from '@hugeicons/core-free-icons';

/** `[tagName, attributes]` pairs. Attribute keys are camelCase, as React expects. */
export type IconData = readonly (readonly [string, Readonly<Record<string, string | number>>])[];

export const icons = {
	// Actions
	search: Search01Icon,
	close: Cancel01Icon,
	check: Tick02Icon,
	indeterminate: MinusSignIcon,
	add: Add01Icon,
	edit: Edit02Icon,
	delete: Delete02Icon,
	archive: Archive02Icon,
	more: MoreHorizontalIcon,
	preview: EyeIcon,
	save: Bookmark02Icon,
	signOut: Logout01Icon,

	// Navigation affordances
	chevronDown: ArrowDown01Icon,
	chevronRight: ArrowRight01Icon,
	/** A real left chevron. Rotating the right one is a missing token, not a style. */
	chevronLeft: ArrowLeft01Icon,
	/** Longer arrow for call-to-action buttons — a chevron reads as "expand". */
	arrowRight: ArrowRight02Icon,
	externalLink: ArrowUpRight01Icon,
	sortAscending: ArrowUp01Icon,
	sortDescending: ArrowDown01Icon,
	sortable: ArrowUpDownIcon,

	// Theme
	themeLight: Sun01Icon,
	themeDark: Moon02Icon,
	themeSystem: ComputerIcon,

	// Domain
	jobs: Briefcase01Icon,
	candidates: UserGroupIcon,
	companies: Building03Icon,
	inbox: InboxIcon,
	salary: MoneyBag01Icon,
	/** A written offer of employment — the document, not the money in it. */
	offer: Agreement02Icon,
	/** The mark beside a verified company's name. Distinct from `verified`, which
	    is the generic tick used for success states. */
	verifiedCompany: BadgeCheckIcon,
	location: Location01Icon,
	schedule: Calendar03Icon,
	time: Clock01Icon,
	analytics: Analytics01Icon,
	settings: Settings02Icon,
	message: Mail01Icon,
	profile: UserAccountIcon,
	invite: MailAdd01Icon,
	addPerson: UserAdd01Icon,
	document: File02Icon,
	upload: Upload01Icon,
	notify: BellRingIcon,
	privacy: LockIcon,
	price: Tag01Icon,

	// Status
	verified: CheckmarkCircle01Icon,
	/** The "not included" mark in a comparison — a role, not the close button. */
	unavailable: Cancel01Icon,
	warning: Alert02Icon,
	info: InformationCircleIcon,
	help: HelpCircleIcon,

	// Job attributes — these give a badge its meaning at a glance.
	workOnsite: Building03Icon,
	workHybrid: ShuffleIcon,
	workRemote: GlobalIcon,
	seniority: Award01Icon,

	// Marketing
	quote: QuoteDownIcon,
	speed: FlashIcon,
	trust: SecurityCheckIcon,
	pipeline: KanbanIcon,
	launch: Rocket01Icon,
	filters: FilterIcon,
	target: Target01Icon,
	growth: ChartUpIcon,
	fairDeal: HandshakeIcon,

	// The three readings of the name, on the about page.
	craft: PaintBrush02Icon,
	enthusiasm: FavouriteIcon,
	delight: SmileIcon
} satisfies Record<string, IconData>;

export type IconName = keyof typeof icons;
