<!--
	@component
	The notes on a job, and a form to add one while the job is open (`canAdd`).
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import TextField from "#lib/components/form/text-field.svelte";
	import { NotesList } from "#lib/orders/components.ts";

	import { addNote, type getMyOrder } from "../portal.remote.ts";

	type Note = Awaited<ReturnType<typeof getMyOrder>>["notes"][number];

	let { orderId, notes, canAdd }: { orderId: number; notes: Note[]; canAdd: boolean } = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.portal_notes()}</Card.Title>
	</Card.Header>
	<Card.Content>
		<NotesList {notes} empty={m.portal_no_notes()} footer={canAdd ? addForm : undefined} />
	</Card.Content>
</Card.Root>

{#snippet addForm()}
	<form
		{...addNote.enhance(async ({ element, submit }) => {
			if (await submitted(submit)) {
				element.reset();
				toast.success(m.portal_note_added());
			}
		})}
		class="flex flex-col gap-2"
	>
		<input {...addNote.fields.id.as("hidden", String(orderId))} />
		<TextField
			field={addNote.fields.text}
			label={m.portal_note_label()}
			multiline
			placeholder={m.portal_note_placeholder()}
		/>
		<SubmitButton variant="outline" size="lg" class="h-12" pending={addNote.pending}>
			{m.portal_add_note()}
		</SubmitButton>
	</form>
{/snippet}
