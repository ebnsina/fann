<script lang="ts">
	import Badge from '#lib/components/ui/Badge.svelte';
	import {
		employmentTypeIcon,
		experienceLevelIcon,
		responsePromiseIcon,
		workModeIcon
	} from '#lib/design/job-icons';
	import { formatRelativeTime, formatSalaryRange, label } from '#lib/utils/format';
	import VerifiedMark from './VerifiedMark.svelte';

	type Props = {
		job: {
			slug: string;
			title: string;
			companyName: string;
			companySlug: string;
			/** True when the company proved it owns its domain. */
			companyVerified?: boolean;
			workMode: string;
			employmentType: string;
			experienceLevel: string;
			salaryMin: number;
			salaryMax: number;
			salaryCurrency: string;
			salaryPeriod: string;
			publishedAt: Date | null;
			applicantCount: number;
			responseSlaDays: number | null;
		};
	};

	let { job }: Props = $props();
</script>

<article
	class="group relative flex flex-col gap-3 border-b border-border bg-surface p-(--fann-space-panel) transition-colors last:border-b-0 hover:bg-surface-hover"
>
	<div class="flex items-start justify-between gap-4">
		<div class="flex min-w-0 flex-col gap-1">
			<h3 class="text-base font-medium text-text">
				<!--
					The whole card is the click target via this overlay, so the accessible
					name stays on a real link rather than a div with a click handler.
				-->
				<a href="/jobs/{job.slug}" class="after:absolute after:inset-0">{job.title}</a>
			</h3>
			<span class="relative z-10 flex w-fit items-center gap-1.5">
				{#if job.companyVerified}
					<VerifiedMark />
				{/if}
				<a
					href="/companies/{job.companySlug}"
					class="text-sm text-text-muted underline-offset-2 hover:text-text hover:underline"
				>
					{job.companyName}
				</a>
			</span>
		</div>

		<!-- Salary is the reason this product exists; it gets the prominent slot. -->
		<p class="shrink-0 font-mono text-sm text-text tabular-nums" data-numeric>
			{formatSalaryRange(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod)}
		</p>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<Badge icon={workModeIcon(job.workMode)}>{label(job.workMode)}</Badge>
		<Badge icon={employmentTypeIcon(job.employmentType)}>{label(job.employmentType)}</Badge>
		<Badge icon={experienceLevelIcon()}>{label(job.experienceLevel)}</Badge>

		{#if job.responseSlaDays}
			<!--
				A promise, and worded as one. Green here would award credit for a
				commitment nobody has checked — whether they keep it is on the company's
				own page, next to what actually happened.
			-->
			<Badge icon={responsePromiseIcon()}>
				Promises {job.responseSlaDays}d
			</Badge>
		{/if}
	</div>

	<div class="flex items-center gap-3 text-xs text-text-subtle">
		<time>{formatRelativeTime(job.publishedAt)}</time>
		<span aria-hidden="true">·</span>
		<span>{job.applicantCount} applicant{job.applicantCount === 1 ? '' : 's'}</span>
	</div>
</article>
