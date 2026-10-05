<!--
	@component
	A delete button that asks for confirmation, then submits `form` (a remote form taking the record's
	`id`) without needing JavaScript for the submission itself.
-->
<script lang="ts">
	import type { RemoteForm } from "$app/server";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	let {
		form,
		id,
		title,
		description,
		label = "Delete",
	}: {
		form: RemoteForm<{ id: string }, unknown>;
		id: string;
		title: string;
		description: string;
		label?: string;
	} = $props();
</script>

<AlertDialog.Root>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="destructive">
				<Trash2Icon data-icon="inline-start" />
				{label}
			</Button>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			<AlertDialog.Description>{description}</AlertDialog.Description>
		</AlertDialog.Header>
		<form {...form}>
			<input {...form.fields.id.as("hidden", id)} />
			<AlertDialog.Footer>
				<AlertDialog.Cancel type="button">Cancel</AlertDialog.Cancel>
				<Button type="submit" variant="destructive" disabled={!!form.pending}>
					{#if form.pending}
						<Spinner data-icon="inline-start" />
					{/if}
					{label}
				</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
