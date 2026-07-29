<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import { toast } from '#lib/components/ui/toast.svelte';
	import { resendVerification } from '../../auth.remote';

	let sending = $state(false);

	async function resend() {
		sending = true;
		try {
			const { sent } = await resendVerification();
			if (sent) toast.success('Sent. Check your inbox.');
			else toast.info('Your email is already confirmed.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not send the email.');
		} finally {
			sending = false;
		}
	}
</script>

<svelte:head><title>Check your inbox · Fann</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-2">
		<h1 class="text-xl font-semibold text-text">Check your inbox</h1>
		<p class="text-sm text-text-muted">
			We sent you a link to confirm your email address. You are signed in already — confirming just
			unlocks applying for jobs and posting them.
		</p>
	</div>

	<div class="flex items-center gap-3">
		<Button href="/" variant="primary">Continue</Button>
		<Button onclick={resend} loading={sending}>Resend email</Button>
	</div>
</div>
