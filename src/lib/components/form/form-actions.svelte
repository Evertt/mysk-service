<!--
	@component
	The submit and cancel buttons at the bottom of a form.
-->
<script lang="ts">
	let {
		pending = false,
		submitLabel = m.common_save(),
		cancelHref,
	}: {
		/** Whether the form is submitting; a remote form's `pending` count works too. */
		pending?: boolean | number;
		submitLabel?: string;
		cancelHref?: string;
	} = $props();
</script>

<div class="flex items-center justify-end gap-2">
	{#if cancelHref}
		<Button variant="ghost" href={cancelHref}>{m.common_cancel()}</Button>
	{/if}
	<Button type="submit" disabled={!!pending}>
		{#if pending}
			<Spinner data-icon="inline-start" />
		{/if}
		{submitLabel}
	</Button>
</div>
