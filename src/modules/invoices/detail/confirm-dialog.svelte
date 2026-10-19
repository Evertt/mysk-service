<!--
	@component
	A button that asks for confirmation, then submits `form` (a remote form taking the invoice's
	`id`) and closes. If the server refuses with `invalid("…")`, the reason is shown in the dialog.
-->
<script lang="ts">
	import type { RemoteForm } from "$app/server";
	import type { Component } from "svelte";
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import type { ButtonVariant } from "#lib/components/ui/button/index.ts";

	let {
		form,
		id,
		label,
		icon: Icon,
		title,
		description,
		done,
		variant = "default",
	}: {
		form: RemoteForm<{ id: string }, unknown>;
		id: string;
		label: string;
		icon: Component;
		title: string;
		description: string;
		/** The toast once it's done. */
		done: string;
		variant?: ButtonVariant;
	} = $props();

	let open = $state(false);
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} {variant}>
				<Icon data-icon="inline-start" />
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
				if (await submitted(submit)) {
					open = false;
					toast.success(done);
				}
			})}
		>
			<input {...form.fields.id.as("hidden", id)} />
			<Field.FieldError errors={form.fields.allIssues()} class="mb-4" />
			<AlertDialog.Footer>
				<AlertDialog.Cancel type="button">{m.common_cancel()}</AlertDialog.Cancel>
				<SubmitButton {variant} pending={form.pending}>{label}</SubmitButton>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
