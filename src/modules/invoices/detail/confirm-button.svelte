<!--
	@component
	A button that asks for confirmation, then submits `form` (a remote form taking the invoice's
	`id`) and closes: `ConfirmDialog` with the button for its trigger. If the server refuses with
	`invalid("…")`, the reason is shown in the dialog.
-->
<script lang="ts">
	import type { RemoteForm } from "$app/server";
	import type { Component } from "svelte";

	import ConfirmDialog from "#lib/components/form/confirm-dialog.svelte";
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
</script>

<ConfirmDialog
	{form}
	hidden={{ id }}
	{title}
	{description}
	confirmLabel={label}
	destructive={variant === "destructive"}
	{done}
>
	{#snippet trigger(props)}
		<Button {...props} {variant}>
			<Icon data-icon="inline-start" />
			{label}
		</Button>
	{/snippet}
</ConfirmDialog>
