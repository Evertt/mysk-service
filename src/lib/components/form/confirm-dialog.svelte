<!--
	@component
	The one way to ask before doing something (`FormDialog` is for a form with fields): a question,
	Cancel and the confirm button. Confirming submits `form` with its `hidden` inputs (e.g. the
	record's `id`), or runs `onconfirm`; `children` adds to the question (e.g. more hidden inputs).
	`disabled` holds the confirm button back, e.g. until a choice in `children` is made.

	Once it went through, it calls `ondone`, toasts `done`, and closes or `leave`s the page (see
	`DialogDone`), each with the form's result or what `onconfirm` answered. If the server refused (`invalid("…")`), the reason is shown in the dialog; if it
	failed, a toast says why and it stays open, as it does when `onconfirm` throws or answers
	`false`. `updates` says which queries the submission refreshes, instead of all of the page's.

	Open it with its `trigger`, or from outside with `bind:open`. The open dialog has a history
	entry of its own (`historyDialog()`), so going back closes it.
-->
<script lang="ts" generics="Form extends DialogForm = never, Confirmed = never">
	import type { RemoteQueryUpdate } from "$app/server";
	import type { Component, Snippet } from "svelte";
	import type { HTMLInputAttributes } from "svelte/elements";

	import {
		type DialogDone,
		type DialogForm,
		dialogHistory,
		finish,
		type FormResult,
		type HiddenInputs,
	} from "./dialogs.svelte.ts";
	import SubmitButton from "./submit-button.svelte";
	import { ran, submitted } from "./submitted.ts";

	let {
		title,
		description,
		confirmLabel,
		confirmIcon,
		destructive = false,
		disabled = false,
		open = $bindable(false),
		trigger,
		form,
		hidden = {},
		updates,
		onconfirm,
		children,
		...finished
	}: DialogDone<FormResult<Form> | Confirmed> & {
		title: string;
		description?: string;
		/** The confirm button's label: what it does, e.g. "Delete". */
		confirmLabel: string;
		confirmIcon?: Component;
		/** Whether it destroys something, for the button's colour. */
		destructive?: boolean;
		/** Whether the confirm button is held back. */
		disabled?: boolean;
		open?: boolean;
		/** The button that opens it; spread `props` on it. */
		trigger?: Snippet<[Record<string, unknown>]>;
		/** Added under the question, in the form if there is one. */
		children?: Snippet;
	} & (
			| {
					/** The form confirming submits. */
					form: Form;
					/** The form's hidden inputs, by field. */
					hidden?: HiddenInputs<Form>;
					/** The queries the submission refreshes, instead of all of the page's. */
					updates?: () => RemoteQueryUpdate[];
					onconfirm?: never;
			  }
			| {
					form?: never;
					hidden?: never;
					updates?: never;
					/** What confirming does; its answer is the result, and `false` keeps the dialog open. */
					onconfirm: () => Promise<Confirmed | false>;
			  }
		) = $props();

	const id = $props.id();
	const dialog = dialogHistory(id, () => undefined, {
		get: () => open,
		set: (value) => (open = value),
	});

	type HiddenField = { as(type: "hidden", value: string): HTMLInputAttributes };
	const fields = $derived(form?.fields as unknown as Record<string, HiddenField> | undefined);
	const hiddenFields = $derived(
		Object.entries(hidden as Record<string, string | undefined>).filter(
			(entry): entry is [string, string] => entry[1] !== undefined,
		),
	);

	let running = $state(false);
	async function confirm() {
		running = true;
		await ran(async () => {
			const result = await onconfirm!();
			if (result !== false) await finish<FormResult<Form> | Confirmed>(dialog(), result, finished);
		});
		running = false;
	}
</script>

<AlertDialog.Root bind:open={() => dialog().open, (value) => (dialog().open = value)}>
	{#if trigger}
		<AlertDialog.Trigger>
			{#snippet child({ props })}
				{@render trigger(props)}
			{/snippet}
		</AlertDialog.Trigger>
	{/if}
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			{#if description}
				<AlertDialog.Description>{description}</AlertDialog.Description>
			{/if}
		</AlertDialog.Header>
		<form
			{...form
				? form.enhance(async (instance) => {
						const { submit } = instance;
						const send = updates ? () => submit().updates(...updates()) : submit;
						if (!(await submitted(send))) return;
						await finish(dialog(), instance.result as FormResult<Form>, finished);
					})
				: {
						onsubmit: (event: SubmitEvent) => {
							event.preventDefault();
							void confirm();
						},
					}}
			class="flex flex-col gap-4"
		>
			{#if fields}
				{#each hiddenFields as [name, value] (name)}
					<input {...fields[name].as("hidden", value)} />
				{/each}
			{/if}
			{@render children?.()}
			<!-- E.g. when the record is still referenced and can't be deleted. -->
			<Field.FieldError errors={form?.fields.allIssues()} />
			<AlertDialog.Footer>
				<AlertDialog.Cancel type="button">{m.common_cancel()}</AlertDialog.Cancel>
				<SubmitButton
					pending={form ? form.pending : running}
					icon={confirmIcon}
					variant={destructive ? "destructive" : "default"}
					{disabled}
				>
					{confirmLabel}
				</SubmitButton>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
