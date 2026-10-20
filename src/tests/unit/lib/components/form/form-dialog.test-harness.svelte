<!--
	@component
	A `FormDialog` with a name field, opened by its own trigger or from outside, for
	`form-dialog.svelte.spec.ts`. Shows whether the parent sees it open.
-->
<script lang="ts">
	import type { ComponentProps } from "svelte";

	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	type Props = ComponentProps<typeof FormDialog<{ id: string; name: string }, { code: string }>>;

	let {
		withTrigger = true,
		...props
	}: Omit<Props, "children" | "trigger" | "open"> & {
		withTrigger?: boolean;
	} = $props();

	let open = $state(false);
</script>

<button type="button" onclick={() => (open = true)}>Open from outside</button>
<p data-testid="open">{open ? "open" : "closed"}</p>

<FormDialog {...props} bind:open trigger={withTrigger ? trigger : undefined}>
	<TextField field={props.form.fields.name} label="Name" />
</FormDialog>

{#snippet trigger(attributes: Record<string, unknown>)}
	<button type="button" {...attributes}>New location</button>
{/snippet}
