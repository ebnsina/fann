/**
 * Privacy policy and terms.
 *
 * Written to describe what the code in this repository actually does — the
 * session cookie in `auth/session.ts`, the scan gate in `scanning/`, the access
 * rules in `services/file-access.ts`, the `email_log` table. A policy that
 * describes a different product to the one running is worse than none, because it
 * is a promise nobody is keeping.
 *
 * **These have not been reviewed by a lawyer.** They are an honest description,
 * not legal advice, and the pages say so where a reader can see it. Get them
 * reviewed before you take real users' data.
 *
 * One thing is still missing and cannot be written here: the registered company
 * name and address of whoever operates the service. Most jurisdictions expect
 * terms to identify the operator, so add a sentence naming it to the last section
 * once the entity exists. It is deliberately absent rather than stubbed — a
 * placeholder on a live legal page is worse than a gap, and an invented company
 * name is worse than either.
 */

/** Where privacy requests and legal notices go. */
export const CONTACT_EMAIL = 'hi@fann.run';

/**
 * Shown as "Last updated". Bump it in the same change that edits the text below,
 * never on its own — a date that moves without the words moving is a lie.
 */
export const LEGAL_UPDATED = '28 July 2026';

export interface LegalSection {
	heading: string;
	/** Each string is a paragraph. Lists are `-` prefixed lines within one string. */
	body: string[];
}

export const PRIVACY: LegalSection[] = [
	{
		heading: 'The short version',
		body: [
			'We collect what we need to run a job board and nothing else. We do not sell your details, we do not share your CV with anyone you did not apply to, and we do not sell lists of candidates to recruiters. There is no advertising network on this site and no third-party tracking script.'
		]
	},
	{
		heading: 'What we collect',
		body: [
			'When you create an account: your name, your email address, and a password. The password is never stored — we keep a one-way hash of it, so nobody here can read it or recover it for you.',
			'When you use the site: a session cookie so you stay signed in, and the IP address and browser the session was created from, which is what lets you spot a sign-in you did not make.',
			'When you apply for a job: the CV and any other files you upload, the answers you give to a company’s questions, and the note you write. When a company changes the status of your application, we record what changed and when.',
			'When we email you: a log of every message we tried to send you, whether it arrived or failed. That record is what makes “you were notified” checkable rather than hopeful.'
		]
	},
	{
		heading: 'Anything you post is public',
		body: [
			'Posts and replies in the feed are public. Anyone can read them, signed in or not, and search engines may index them. Your name is on them.',
			'This is separate from your profile setting. A private profile stays private — it is about whether companies can find you in a search — but a post is something you chose to say out loud, and we cannot make it both public and hidden. If you would rather not be seen job-hunting by your current employer, do not post about it.',
			'You can delete your own posts and replies at any time. Deleting hides them from everyone; we keep the row so a moderator can still answer questions about a thread. Closing your account removes your posts along with everything else.',
			'A company can turn off replies on its own posts. That is its decision, and it does not affect anything you have written elsewhere.'
		]
	},
	{
		heading: 'Who can see your CV',
		body: [
			'Two groups, and no others: you, and people at a company you actually sent it to. Membership of a company is not enough on its own — a recruiter has to be at a company that received an application carrying that specific file.',
			'Files are not served from a public link. Every download is checked against those rules at the moment it is requested, so someone who leaves a company loses access immediately rather than when a link expires.',
			'Nothing you upload is readable by anyone but you until it has been checked for viruses. A file that cannot be checked is treated as one that failed.'
		]
	},
	{
		heading: 'Cookies',
		body: [
			'Two, and both are ours. One keeps you signed in: it is marked HttpOnly so scripts cannot read it, and Secure so it never travels over plain HTTP. The other remembers whether you chose the light or the dark theme, which is why the page does not flash white while it works that out.',
			'We do not use analytics cookies, advertising cookies, or anything belonging to another company. That is why you have not been asked to accept a banner.'
		]
	},
	{
		heading: 'Who else is involved',
		body: [
			'We use an email provider to deliver messages to you, and cloud storage to hold uploaded files. Those providers process data on our instructions and for no other purpose.',
			'We do not use an advertising network, a data broker, or a CV database. Nobody buys anything about you from us.'
		]
	},
	{
		heading: 'How long we keep things',
		body: [
			'Your account and your files stay until you ask us to remove them.',
			'A company keeps the record of an application you sent it, in the same way it would keep an email you sent. We cannot undo that on their behalf, and a service that let applications vanish from a company’s records would be no use to either side.'
		]
	},
	{
		heading: 'Your rights',
		body: [
			`Download everything we hold about you, or close your account and delete your files, from your settings page. Neither needs to go through us. Applications you already sent stay with the companies you sent them to, without your name on them — that is their record of their own hiring, and we cannot undo it on their side. To have something corrected, write to ${CONTACT_EMAIL}.`
		]
	},
	{
		heading: 'Changes',
		body: [
			'If we change what we collect or who can see it, we will change this page and move the date at the top. Material changes will be emailed to people with an account rather than quietly published.'
		]
	}
];

export const TERMS: LegalSection[] = [
	{
		heading: 'The short version',
		body: [
			'Use Fann to look for work or to hire. Be truthful in what you post and how you treat people. If you post jobs here, you agree to publish the salary and to answer everyone who applies — that is the whole point of the site, not a setting.'
		]
	},
	{
		heading: 'Your account',
		body: [
			'One account per person. Keep your password to yourself, and tell us if you think someone else has it.',
			'You must be old enough to work where you are applying, and old enough to enter a contract where you live.'
		]
	},
	{
		heading: 'If you are hiring',
		body: [
			'Every job you post must state a salary range you would genuinely pay for that role. The field is required and there is no way around it.',
			'You must respond to every applicant. Turning someone down asks you for a reason, and the applicant reads what you wrote — so write something a person can read.',
			'If you publish a response time, we measure you against it and show the result to candidates. Missing it does not get your account closed; hiding it is simply not possible.',
			'Post real jobs for real vacancies. No adverts disguised as roles, no collecting CVs for a job that does not exist, and nothing that discriminates against people on grounds protected where the job is based.'
		]
	},
	{
		heading: 'If you are applying',
		body: [
			'Tell the truth in your profile and your applications.',
			'What you upload must be yours to upload, and must not contain anything harmful.'
		]
	},
	{
		heading: 'What we may remove',
		body: [
			'We can take down a listing, or suspend an account, that breaks these terms — most often a job with a fake salary range, a role that does not exist, or a company that never replies to anybody.',
			'We will tell you why, and you can reply.'
		]
	},
	{
		heading: 'What we do not promise',
		body: [
			'We do not promise you a job, or an applicant. We do not verify that every company is who it says it is, though we do verify domains where we can, and we say on the page when something has been checked and when it has not.',
			'The service is provided as it is. We will keep it running and fix what breaks, but we cannot promise it will never be unavailable.'
		]
	},
	{
		heading: 'Money',
		body: [
			'Fann is free for people looking for work, and will stay that way.',
			'It is free for companies during the public beta. When we start charging it will be for each job you have open, we will tell you well before it begins, and we will never charge you for a period that has already passed.'
		]
	},
	{
		heading: 'Changes and contact',
		body: [
			`If we change these terms we will move the date at the top and email people with an account.`,
			`Questions, complaints and legal notices go to ${CONTACT_EMAIL}, and a person reads them.`
		]
	}
];
