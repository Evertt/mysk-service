<!--
	@component
	The one way to build a dialog with a form (`ConfirmDialog` asks a question without fields):
	the title, the fields (`children`), why the server refused (`invalid("…")`), Cancel and the
	submit button. `hidden` adds the form's hidden inputs (e.g. the record's `id`).

	Once the server accepted it, the dialog calls `ondone`, toasts `done`, resets the form if
	`reset`, and closes or `leave`s the page (see `DialogDone`). If submitting failed, `submitted()`
	toasts why and it stays open. `updates` says which queries the submission refreshes, instead of
	all of the page's.

	Open it with its `trigger`, or from outside with `bind:open`. The open dialog has a history
	entry of its own (`historyDialog()`), so going back closes it; pass `history` when the opener
	keeps that entry itself (to open it for a record, say).
-->
<script lang="ts" generics="Form extends DialogForm">
	import type { RemoteQueryUpdate } from "$app/server";
	import type { Component, Snippet } from "svelte";
	import type { HTMLInputAttributes } from "svelte/elements";

	import type { HistoryDialog } from "../history-dialog.svelte.ts";
	import {
		type DialogDone,
		type DialogForm,
		dialogHistory,
		finish,
		type FormResult,
		type HiddenInputs,
	} from "./dialogs.svelte.ts";
	import SubmitButton from "./submit-button.svelte";
	import { submitted } from "./submitted.ts";

	let {
		form,
		title,
		description,
		submitLabel = m.common_save(),
		submitIcon,
		destructive = false,
		open = $bindable(false),
		trigger,
		hidden = {},
		reset = false,
		updates,
		history,
		class: className,
		children,
		...finished
	}: DialogDone<FormResult<Form>> & {
		form: Form;
		title: string;
		description?: string;
		/** The submit button's label; "Save" if not given. */
		submitLabel?: string;
		submitIcon?: Component;
		/** Whether submitting destroys something, for the button's colour. */
		destructive?: boolean;
		open?: boolean;
		/** The button that opens it; spread `props` on it. */
		trigger?: Snippet<[Record<string, unknown>]>;
		/** The form's hidden inputs, by field. */
		hidden?: HiddenInputs<Form>;
		/** Whether to empty the fields once it's done, e.g. for the next new record. */
		reset?: boolean;
		/** The queries the submission refreshes, instead of all of the page's. */
		updates?: () => RemoteQueryUpdate[];
		/** The dialog's history entry, when its opener keeps it. */
		history?: HistoryDialog;
		/** The dialog's classes, e.g. its width. */
		class?: string;
		/** The fields, in their `Field.FieldGroup`s. */
		children: Snippet;
	} = $props();

	const id = $props.id();
	const dialog = dialogHistory(id, () => history, {
		get: () => open,
		set: (value) => (open = value),
	});

	type HiddenField = {
		as(type: "hidden", value: string): HTMLInputAttributes;
		issues(): { message: string }[] | undefined;
	};
	const fields = $derived(form.fields as unknown as Record<string, HiddenField>);
	const hiddenFields = $derived(
		Object.entries(hidden as Record<string, string | undefined>).filter(
			(entry): entry is [string, string] => entry[1] !== undefined,
		),
	);
	// The fields show their own; these are the form's and those of its hidden inputs.
	const issues = $derived([
		...(form.fields.issues() ?? []),
		...hiddenFields.flatMap(([name]) => fields[name].issues() ?? []),
	]);
</script>

<Dialog.Root bind:open={() => dialog().open, (value) => (dialog().open = value)}>
	{#if trigger}
		<Dialog.Trigger>
			{#snippet child({ props })}
				{@render trigger(props)}
			{/snippet}
		</Dialog.Trigger>
	{/if}
	<Dialog.Content class={className}>
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			{#if description}
				<Dialog.Description>{description}</Dialog.Description>
			{/if}
		</Dialog.Header>
		<form
			{...form.enhance(async (instance) => {
				const { element, submit } = instance;
				const send = updates ? () => submit().updates(...updates()) : submit;
				if (!(await submitted(send))) return;
				// Before the reset, which may forget it.
				const result = instance.result as FormResult<Form>;
				if (reset) element.reset();
				await finish(dialog(), result, finished);
			})}
			class="flex flex-col gap-6"
		>
			{#each hiddenFields as [name, value] (name)}
				<input {...fields[name].as("hidden", value)} />
			{/each}
			{@render children()}
			<Field.FieldError errors={issues} />
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="ghost">{m.common_cancel()}</Button>
					{/snippet}
				</Dialog.Close>
				<SubmitButton
					pending={form.pending}
					icon={submitIcon}
					variant={destructive ? "destructive" : "default"}
				>
					{submitLabel}
				</SubmitButton>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
