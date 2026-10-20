<!--
	@component
	Adds a point to a checklist template, or edits one: what's checked, and the group it's under
	(one of the template's, offered as suggestions, or a new one). A point that changes group goes
	last in the other.
-->
<script lang="ts">
	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import FormField from "#lib/components/form/form-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import { createPoint, savePoint } from "../templates.remote.ts";

	let {
		templateId,
		groups,
		point,
		group,
		open = $bindable(false),
	}: {
		templateId: number;
		/** The template's groups, to suggest. */
		groups: string[];
		/** The point to edit; a new one if not given. */
		point?: { id: number; group: string; text: string };
		/** The group a new point is for, e.g. the one whose "Add point" was clicked. */
		group?: string;
		open?: boolean;
	} = $props();

	const form = $derived(point ? savePoint.for(String(point.id)) : createPoint);
	const fields = $derived(form.fields);
	const listId = $props.id();
</script>

<FormDialog
	{form}
	title={point ? m.checklists_point_edit_title() : m.checklists_point_new_title()}
	description={m.checklists_point_dialog_description()}
	submitLabel={m.checklists_save_point()}
	hidden={point ? { id: String(point.id) } : { templateId: String(templateId) }}
	reset={!point}
	done={m.checklists_point_saved()}
	class="sm:max-w-lg"
	bind:open
>
	<Field.FieldGroup>
		<FormField
			label={m.checklists_field_group()}
			issues={fields.group.issues()}
			description={m.checklists_field_group_description()}
		>
			{#snippet children({ id })}
				<Input
					{id}
					list={listId}
					autocomplete="off"
					placeholder={m.checklists_field_group_placeholder()}
					{...fields.group.as("text", point?.group ?? group ?? "")}
				/>
				<datalist id={listId}>
					{#each groups.filter(Boolean) as name (name)}
						<option value={name}></option>
					{/each}
				</datalist>
			{/snippet}
		</FormField>
		<TextField
			field={fields.text}
			label={m.checklists_field_text()}
			value={point?.text}
			multiline
			placeholder={m.checklists_field_text_placeholder()}
		/>
	</Field.FieldGroup>
</FormDialog>
