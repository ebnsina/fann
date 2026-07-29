import { icons, type IconData } from '#lib/design/icons';

/**
 * Marketing copy, kept out of the templates so it can be reviewed as writing
 * rather than read between class attributes.
 *
 * House style, in one line: say it the way you would say it out loud.
 *
 * - Everyday words. "Pay", not "compensation". "Company", not "organization".
 *   "Hiring stages", not "pipeline". Never a word from the codebase.
 * - Short sentences, and one idea in each.
 * - Speak to the reader as "you" and to us as "we".
 * - Say what is true today. If a thing is not built yet, the copy says so.
 */

export interface Feature {
	icon: IconData;
	title: string;
	body: string;
}

/** Each of these is built into the product, not left to the employer to switch on. */
export const CANDIDATE_FEATURES: Feature[] = [
	{
		icon: icons.salary,
		title: 'You always see the pay',
		body: 'Every job here shows what it pays before you apply. No "competitive salary", no finding out an hour into a call that it was never going to work.'
	},
	{
		icon: icons.analytics,
		title: 'You can tell if the pay is any good',
		body: 'Each listing shows where its range sits against other jobs of the same kind and level, worked out from this board. A number on its own tells you nothing; a number in context tells you whether to bother.'
	},
	{
		icon: icons.message,
		title: 'You always get an answer',
		body: 'Companies here cannot quietly close your application. If the answer is no, they have to give a reason, and you read exactly what they wrote.'
	},
	{
		icon: icons.trust,
		title: 'You can see how a company really behaves',
		body: 'Before you apply, see what share of applications a company actually answers and how long it usually takes. We time it from real applications, so nobody can type in a figure they like the look of.'
	},
	{
		icon: icons.save,
		title: 'Apply in about a minute',
		body: 'Keep more than one CV on file, named however you like, and pick the right one as you apply. Save jobs to come back to — saving is invisible to the company.'
	},
	{
		icon: icons.privacy,
		title: 'Your details stay yours',
		body: 'Your profile is private until you say otherwise, and your CV opens only for companies you actually applied to. Download everything we hold whenever you like, and close your account yourself.'
	}
];

export const EMPLOYER_FEATURES: Feature[] = [
	{
		icon: icons.speed,
		title: 'Fewer applicants, better ones',
		body: 'Showing the pay turns away everyone the number does not suit. What is left is a shorter list of people who saw it and applied anyway.'
	},
	{
		icon: icons.pipeline,
		title: 'One board your whole team works from',
		body: 'Drag people between your own hiring stages, or move a batch at once. Every change is kept, with who made it and when, so nobody has to reconstruct what happened.'
	},
	{
		icon: icons.notify,
		title: 'Nobody is left wondering',
		body: 'Move someone forward or turn them down and they are told straight away. Turning someone down asks you for a reason, because the candidate is going to read it.'
	},
	{
		icon: icons.schedule,
		title: 'Interviews, and feedback worth reading',
		body: 'Book an interview and the candidate gets the details and a calendar invite. Nobody on the panel can read another interviewer’s scorecard until they have written their own.'
	},
	{
		icon: icons.offer,
		title: 'Offers with the number on them',
		body: 'An offer cannot be sent without a salary. The candidate accepts or declines it in their own account, so your board and the offer never disagree about whether somebody took the job.'
	},
	{
		icon: icons.analytics,
		title: 'Reports that come from the work',
		body: 'Time to hire, how far people get, and where they sit waiting — worked out from your board rather than from anything you have to fill in.'
	}
];

export interface Step {
	title: string;
	body: string;
}

export const CANDIDATE_STEPS: Step[] = [
	{
		title: 'Search with the pay in view',
		body: 'Filter by salary, remote or office, and level. Every result shows its range, and every listing says how it compares to the going rate.'
	},
	{
		title: 'Check who you are dealing with',
		body: 'Each company page shows what share of applications it answers and how long it takes. Measured here, not claimed by them.'
	},
	{
		title: 'Apply in about a minute',
		body: 'Pick a CV you have already uploaded and add a note if you want to.'
	},
	{
		title: 'Follow it all the way',
		body: 'See where it is, how long it has been waiting, the reason if the answer is no — and accept the offer if the answer is yes.'
	}
];

export const EMPLOYER_STEPS: Step[] = [
	{
		title: 'Set up your company',
		body: 'Add your company name and website, then invite the people who will be hiring with you.'
	},
	{
		title: 'Post a job with its pay',
		body: 'Write the role, add the salary range, and choose a reply time you can actually keep to.'
	},
	{
		title: 'Work through your board',
		body: 'Read, shortlist, interview and decide. Everyone gets an answer, because we ask you for one.'
	},
	{
		title: 'See how you are doing',
		body: 'Reports show your time to hire, how far people get, and anyone left waiting too long.'
	}
];

export interface Testimonial {
	quote: string;
	role: string;
	company: string;
}

/**
 * No testimonials yet.
 *
 * There were placeholder quotes here, written in-house. They are gone: a quote is
 * a claim that a named person said a thing, and a disclaimer does not make an
 * invented one honest. `Testimonials.svelte` and the type above stay, so adding
 * real ones is filling in an array and rendering the component on the landing
 * page — see the slot marked in `routes/(public)/+page.svelte`.
 */
export const TESTIMONIALS: Testimonial[] = [];

export interface Faq {
	question: string;
	answer: string;
}

export const CANDIDATE_FAQ: Faq[] = [
	{
		question: 'Is the salary really on every job?',
		answer:
			'Yes. A job cannot be saved here at all without a pay range, so there is no way to forget it or leave it out.'
	},
	{
		question: 'What stops a company posting a range so wide it means nothing?',
		answer:
			'Every listing now shows where it sits against other jobs of the same kind and level, worked out from the ranges on this board. A range nobody can justify is visible as one. You can see the whole picture under "Pay".'
	},
	{
		question: 'How do I know what a job should pay?',
		answer:
			'Look under "Pay". We work out what each kind of role pays at each level from the ranges published here, and every listing shows where it sits against that. You can also see what people report actually earning, which is usually a little under what jobs advertise. Nothing is published for a role until at least eight jobs or reports are behind it.'
	},
	{
		question: 'Who can see my profile?',
		answer:
			'Nobody, unless you say otherwise. A new profile is private, and you change that on your profile page — the three settings are private, findable without your name, and public. Whichever you pick, your CV can only be opened by a company you actually applied to. Posting in the feed is separate and always public, with your name on it.'
	},
	{
		question: 'How do you know a company actually replies?',
		answer:
			'We time it. Every application records when someone from the company first responded, and that stamp is set once and never reset — so a company cannot improve its own figure by going back over old applications. Their page shows what share they answered and how long it typically took. Nothing is shown until there are at least five applications old enough to judge, because two out of two is not a track record.'
	},
	{
		question: 'Does it cost anything?',
		answer: 'No. Fann is free for people looking for work, and always will be.'
	},
	{
		question: 'Can I delete my account?',
		answer:
			'Yes, from your settings page. It deletes your profile, your CVs, your saved jobs and your sign-in details. Applications you already sent stay with those companies without your name on them — that is their record of their own hiring, and not something we can undo for them.'
	}
];

export const EMPLOYER_FAQ: Faq[] = [
	{
		question: 'Do we have to show the salary?',
		answer:
			'Yes. It is the one thing we do not make optional. If that does not work for you, this is not the right place to post, and it is better we both know now.'
	},
	{
		question: 'What happens if we miss the reply time we promised?',
		answer:
			'Candidates see how long they have been waiting next to what you said. Nothing is hidden from them, and nothing happens to your account automatically.'
	},
	{
		question: 'What reporting do we get?',
		answer:
			'Time to hire, how far people get through your stages, how long they sit in each one, who is still waiting on you, and which sources end in a hire. It is worked out from the board as you use it, so there is nothing extra to fill in. Averages are hidden until there are five of something, because below that one slow week says more than how you actually work.'
	},
	{
		question: 'Can we use Fann alongside the system we already have?',
		answer:
			'For now, applications live here. We plan to add a download of your data and a way to connect Fann to other systems. Neither is built yet.'
	},
	{
		question: 'What does it cost?',
		answer:
			'Nothing today. When we do start charging it will be per open job, we will tell you well before it starts, and we will never charge you for the past.'
	},
	{
		question: 'How many people can we add?',
		answer:
			'As many as you like. We do not charge per seat, and we are not planning to — a hiring manager who cannot get in just emails a recruiter instead, which helps nobody.'
	}
];

/* ---------------------------------------------------------------------------
   Join pages
   The sign-up pages carry the full case for joining, so someone can decide
   without going anywhere else first.
   --------------------------------------------------------------------------- */

/**
 * Everything a company gets, in the order it matters when you are deciding.
 *
 * Six, not eight. The grid draws its dividers as a gap showing the border colour
 * through, so a count that does not fill the last row leaves a grey box rather
 * than blank space. Anything that does not fit here belongs in COMPANY_INCLUDED.
 */
export const COMPANY_JOIN_BENEFITS: Feature[] = [
	{
		icon: icons.price,
		title: 'Free during public beta',
		body: 'No card, no trial running out. Post as many jobs as you like and add your whole team.'
	},
	{
		icon: icons.speed,
		title: 'A shorter, better shortlist',
		body: 'Showing the pay filters out the mismatches before they apply, so you spend your time reading people who fit.'
	},
	{
		icon: icons.pipeline,
		title: 'A board, not an inbox',
		body: 'Drag people through your own stages, move a batch at once, and keep notes your team can see and the candidate cannot.'
	},
	{
		icon: icons.schedule,
		title: 'Interviews and honest feedback',
		body: 'Calendar invites go out with the details. Interviewers cannot read each other’s scorecards until they have written their own, so four opinions stay four opinions.'
	},
	{
		icon: icons.analytics,
		title: 'Numbers you did not have to collect',
		body: 'Time to hire, how far people get, where they wait, and which sources end in a hire — all worked out from the board you were using anyway.'
	},
	{
		icon: icons.growth,
		title: 'A reputation candidates trust',
		body: 'Your reply time is measured here, not claimed by you. Companies that get back to people quickly can prove it, and good candidates notice.'
	}
];

/** The same thing for candidates, written for someone mid-search. */
export const CANDIDATE_JOIN_BENEFITS: Feature[] = [
	{
		icon: icons.salary,
		title: 'Never guess the salary again',
		body: 'Every single job here shows what it pays. Filter by it, sort by it, and skip anything that is not worth your evening.'
	},
	{
		icon: icons.analytics,
		title: 'Know what the job is worth',
		body: 'See what your kind of role pays across the whole board, by level, and whether a listing is above or below it. You can add what you earn too, anonymously.'
	},
	{
		icon: icons.message,
		title: 'An answer every time',
		body: 'No more silence. If a company says no, they have to say why, and you read it in your own account.'
	},
	{
		icon: icons.time,
		title: 'Know how long you are waiting',
		body: 'Companies publish a reply time. We count the days for you and say plainly when one has been missed.'
	},
	{
		icon: icons.save,
		title: 'One account, less repetition',
		body: 'Keep your CVs on file, save jobs for later, and apply with a couple of clicks. Nobody sees what you saved.'
	},
	{
		icon: icons.privacy,
		title: 'Nobody is selling your details',
		body: 'Your profile is private unless you change it, your CV is readable only by companies you applied to, and you can download or delete everything yourself.'
	}
];

/** Four steps, because the join pages walk someone all the way to their first job post. */
export const COMPANY_JOIN_STEPS: Step[] = [
	{
		title: 'Create your account',
		body: 'Your name, your work email and a password. It takes about a minute.'
	},
	{
		title: 'Confirm your email',
		body: 'We send a link. Clicking it is what lets you set your company up.'
	},
	{
		title: 'Add your company',
		body: 'Company name and website. Invite your team now or later, whichever suits.'
	},
	{
		title: 'Post your first job',
		body: 'Write the role, add the pay range, and choose how quickly you will reply.'
	}
];

export const CANDIDATE_JOIN_STEPS: Step[] = [
	{
		title: 'Create your account',
		body: 'Name, email and a password. Nothing else, and no CV needed yet.'
	},
	{
		title: 'Upload your CV',
		body: 'One file, kept private, ready for every application after this one.'
	},
	{
		title: 'Search with the pay showing',
		body: 'Filter by salary, remote or office, and level, and see the range on every result.'
	},
	{
		title: 'Apply and follow along',
		body: 'Your dashboard shows where each application is and how long it has been there.'
	}
];

export interface ComparisonRow {
	label: string;
	fann: string;
	elsewhere: string;
}

/**
 * A side-by-side, written carefully: "most job boards" is a fair description of
 * the norm and names nobody. Every claim in the Fann column is something the
 * product does today — if one stops being true, the row comes out.
 */
export const COMPANY_COMPARISON: ComparisonRow[] = [
	{
		label: 'Salary on the listing',
		fann: 'Required on every job',
		elsewhere: 'Optional, and usually left off'
	},
	{
		label: 'Turning someone down',
		fann: 'Needs a reason, and they read it',
		elsewhere: 'Close the tab and move on'
	},
	{
		label: 'Reply times',
		fann: 'Measured by us and shown to candidates',
		elsewhere: 'Not tracked at all'
	},
	{
		label: 'Tracking who applied',
		fann: 'Built in, with the full history',
		elsewhere: 'A forwarded email, or a separate bill'
	},
	{
		label: 'Interview feedback',
		fann: 'Hidden until each person has written theirs',
		elsewhere: 'A shared document everyone reads first'
	},
	{
		label: 'Offers',
		fann: 'Must carry a salary, answered by the candidate',
		elsewhere: 'A PDF and a phone call'
	},
	{
		label: 'Reporting',
		fann: 'From the board, with nothing to fill in',
		elsewhere: 'An upgrade, or a spreadsheet somebody maintains'
	},
	{
		label: 'Team members',
		fann: 'As many as you want, free',
		elsewhere: 'Charged per seat'
	},
	{
		label: 'Cost right now',
		fann: 'Nothing during public beta',
		elsewhere: 'Per job post, up front'
	}
];

/**
 * What a candidate account actually does today, as a plain checklist.
 *
 * The company join page has carried an honest pair of lists — included, and not
 * built yet — since it was written. This page did not, which made it the one
 * marketing page in the product quietly holding itself to a lower standard than
 * the one next to it.
 */
export const CANDIDATE_INCLUDED: string[] = [
	'Every job on the board shows what it pays',
	'One account to apply, and to hire later if you ever do',
	'Several CVs, and you choose which one goes with each application',
	'A timeline for every application, with the reason if the answer is no',
	'Saved jobs nobody at the company can see',
	'Interview times in your own timezone, with a calendar file',
	'Offers you accept or decline yourself, in your own account',
	'A profile you can keep private, or hide entirely',
	'Notifications in the product, and email you can switch off per kind',
	'What roles actually pay, from published ranges and reported salaries',
	'Report your own pay without an account',
	'Download everything we hold about you, and close your account yourself'
];

/**
 * The gaps. Same rule as `COMPANY_ROADMAP`: this list only works if it shrinks,
 * so shipping one of these moves the line into `CANDIDATE_INCLUDED` in the same
 * change. A roadmap still promising what the product already does reads as a
 * page nobody maintains, which is exactly the impression it exists to avoid.
 */
export const CANDIDATE_ROADMAP: string[] = [
	'Email alerts when a job matching what you want is posted',
	'Messaging a company from inside Fann',
	'Job suggestions picked for you'
];

/** Shown as a plain checklist on the company join page. */
export const COMPANY_INCLUDED: string[] = [
	'Unlimited job posts',
	'Reporting on time-to-hire and where applicants come from',
	'Unlimited team members',
	'Six levels of access for your team',
	'CV storage with virus checking',
	'Automatic emails to candidates',
	'A full history of every application',
	'Reply times measured for you',
	'Your jobs on the public board',
	'A drag-and-drop board for your hiring stages',
	'Interview scheduling, with calendar invites',
	'Interview feedback nobody can read until they have written their own',
	'Written offers, answered by the candidate in their own account',
	'Download everything your company holds, and close the account yourself',
	'An API to post jobs and updates from your own site, with signed webhooks'
];

/**
 * Being straight about what is not here yet. A join page that lists only the
 * good parts gets found out in week one, and the person who signed up is the one
 * who looks foolish to their team.
 *
 * This list only works if it shrinks. When you ship one of these, move the line
 * to `COMPANY_INCLUDED` in the same change — a roadmap that still promises what
 * the product already does is as misleading as one that hides a gap, and it
 * reads as a page nobody maintains.
 */
export const COMPANY_ROADMAP: string[] = [
	'Paid plans — everything is free while this is in public beta',
	'Job alerts for candidates, so a new listing reaches people who want it'
];

/**
 * The three things we ask of a company, stated up front rather than buried in
 * terms. Someone who cannot agree to them should find out on this page, not
 * after writing a job post.
 */
export const COMPANY_COMMITMENTS: Feature[] = [
	{
		icon: icons.salary,
		title: 'Show what the job pays',
		body: 'Every job you post needs a salary range. There is no way around it and no reviewer to ask.'
	},
	{
		icon: icons.message,
		title: 'Answer everyone who applies',
		body: 'Turning someone down asks you for a reason, and they get to read it. There is no silent close.'
	},
	{
		icon: icons.time,
		title: 'Mean your reply time',
		body: 'You choose the number of days. Candidates watch the clock against it, and so do we.'
	}
];

/** Promises on the candidate join page. Each one is enforced in the product. */
export const CANDIDATE_PROMISES: Feature[] = [
	{
		icon: icons.privacy,
		title: 'We never sell your details',
		body: 'No recruiter can buy a list of candidates from us, because we do not sell one.'
	},
	{
		icon: icons.document,
		title: 'Your CV goes where you send it',
		body: 'Only you and the companies you applied to can open it. Nobody else, including people who work here without a reason to.'
	},
	{
		icon: icons.notify,
		title: 'Email you can switch off',
		// Worded from what `services/notification.ts` actually does. It used to say
		// everything beyond applications was opt-in, which was never true — there is
		// no marketing email to opt into, and the real control is per kind.
		body: 'Only about your own applications, interviews and offers, and you can switch off each kind. Turning email off never hides the answer — it is still in the product.'
	}
];
