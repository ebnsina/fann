<script lang="ts">
	import Form from './Form.svelte';

	/**
	 * Mounts `Form` with a stand-in for the remote form object, so the spec beside
	 * it can assert on the rendered element without a server round trip.
	 */
	const form = { method: 'POST', action: '?/remote=test' };
</script>

<Form {form}>
	<input name="email" type="email" />
	<button type="submit">Save</button>
</Form>
