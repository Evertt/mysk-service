<!--
	@component
	A delete button that asks for confirmation, then submits `form` (a remote form taking the record's
	`id`) without needing JavaScript for the submission itself. If the server refuses with
	`invalid("…")`, the reason is shown in the dialog.

	The submission doesn't refresh the page's queries (which SvelteKit does by default): `form` says
	what changes itself, refreshing it on the server or redirecting to a page that loads afresh (the
	list), and the record's own queries would only answer that it's gone. Asked again while the page
	is left, they failed in the parts that show their errors, the modules' slots.

	The open dialog has a history entry of its own (`historyDialog()`), so going back closes it.
-->
<script lang="ts">
	import type { RemoteForm } from "$app/server";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import { historyDialog } from "../history-dialog.svelte.ts";
	import { submitted } from "./submitted.ts";

	let {
		form,
		id,
		title,
		description,
		label = m.common_delete(),
	}: {
		form: Omit<RemoteForm<{ id: string }, unknown>, "for">;
		id: string;
		title: string;
		description: string;
		label?: string;
	} = $props();

	// Keyed by the record, for a list of them (the members).
	const dialog = $derived(historyDialog(`delete-${id}`));
</script>

<AlertDialog.Root bind:open={() => dialog.open, (open) => (dialog.open = open)}>
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
		<form
			{...form.enhance(async ({ submit }) => {
				// Deleted without leaving the page (a member): the dialog's history entry goes too.
				if ((await submitted(() => submit().updates())) && dialog.open) dialog.open = false;
			})}
		>
			<input {...form.fields.id.as("hidden", id)} />
			<!-- E.g. when the record is still referenced and can't be deleted. -->
			<Field.FieldError errors={form.fields.allIssues()} class="mb-4" />
			<AlertDialog.Footer>
				<AlertDialog.Cancel type="button">{m.common_cancel()}</AlertDialog.Cancel>
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
