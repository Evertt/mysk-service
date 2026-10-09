<!--
	@component
	The notes on a job, and a form to add one while the job is open (`canAdd`).
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { formatDateTime } from "#lib/i18n/format.ts";

	import { addNote, type getMyOrder } from "../portal.remote.ts";

	type Note = Awaited<ReturnType<typeof getMyOrder>>["notes"][number];

	let { orderId, notes, canAdd }: { orderId: number; notes: Note[]; canAdd: boolean } = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.portal_notes()}</Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		{#each notes as note (note.id)}
			<div class="flex flex-col gap-1 rounded-lg bg-muted p-3">
				<p class="text-sm whitespace-pre-line">{note.text}</p>
				<span class="text-xs text-muted-foreground">
					{note.author ?? m.portal_someone()} · {formatDateTime(note.createdAt)}
				</span>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">{m.portal_no_notes()}</p>
		{/each}
		{#if canAdd}
			<form
				{...addNote.enhance(async ({ element, submit }) => {
					if (await submit()) {
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
		{/if}
	</Card.Content>
</Card.Root>
