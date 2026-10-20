<!--
	@component
	The one way to build a record's form (an order's, a customer's): for creating it, or with the
	`record` it edits (whose `id` it submits in a hidden input). The fields go in `children`, in
	`FormSection`s; the form's own problems (none at a field) show below them, then Cancel
	(`cancelHref`) and the submit button (`submitLabel`).

	What's typed and not saved yet comes back with the page (`formSnapshot`, as `snapshot`). Once
	the server accepted it (and redirected to the record), it toasts `done`; if submitting failed,
	`submitted()` toasts why. `preflight` checks the input in the browser before submitting.
-->
<script lang="ts" generics="Form extends RecordFormLike">
	import { type Snippet, untrack } from "svelte";
	import { toast } from "svelte-sonner";

	import FormActions from "./form-actions.svelte";
	import { formSnapshot } from "./form-snapshot.ts";
	import type { EditedRecord, RecordFormLike } from "./record-form.ts";
	import { submitted } from "./submitted.ts";

	let {
		form,
		record,
		snapshot,
		submitLabel,
		done,
		cancelHref,
		preflight,
		children,
	}: {
		form: Form;
		/** The record it edits; none for a new one. */
		record?: EditedRecord<Form>;
		/** The form's name on the page, which keeps what's typed with the page's history entry. */
		snapshot: string;
		submitLabel: string;
		/** The toast once the server accepted it, e.g. "Customer saved". */
		done: string;
		cancelHref: string;
		/** A schema the browser checks the input with before submitting. */
		preflight?: Parameters<Form["preflight"]>[0];
		/** The fields, in `FormSection`s. */
		children: Snippet;
	} = $props();

	// Registered once, with the page's history entry: the name doesn't change.
	formSnapshot(
		untrack(() => snapshot),
		() => form,
	);

	const checked = $derived(preflight ? form.preflight(preflight) : form);
</script>

<form
	{...checked.enhance(async ({ submit }) => {
		// On success the server redirects to the record; otherwise the fields show what's wrong.
		if (await submitted(submit)) toast.success(done);
	})}
	class="flex flex-col gap-6"
>
	<!-- A form that edits a record has its `id` field (`EditedRecord`). -->
	{#if record && form.fields.id}
		<input {...form.fields.id.as("hidden", String(record.id))} />
	{/if}

	{@render children()}

	<!-- E.g. when the record changed meanwhile so that it can't be saved any more. -->
	<Field.FieldError errors={form.fields.issues()} />
	<FormActions pending={form.pending} {submitLabel} {cancelHref} />
</form>
