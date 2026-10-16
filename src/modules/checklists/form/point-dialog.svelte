<!--
	@component
	Adds a point to a checklist template, or edits one: what's checked, and the group it's under
	(one of the template's, offered as suggestions, or a new one). A point that changes group goes
	last in the other.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import FormField from "#lib/components/form/form-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { errorMessage } from "#lib/utils.ts";

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

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title
				>{point ? m.checklists_point_edit_title() : m.checklists_point_new_title()}</Dialog.Title
			>
			<Dialog.Description>{m.checklists_point_dialog_description()}</Dialog.Description>
		</Dialog.Header>
		<form
			{...form.enhance(async ({ element, submit }) => {
				try {
					if (!(await submit())) return;
				} catch (error) {
					toast.error(errorMessage(error, m.common_error_generic()));
					return;
				}
				open = false;
				if (!point) element.reset();
				toast.success(m.checklists_point_saved());
			})}
			class="flex flex-col gap-6"
		>
			{#if point}
				<input {...savePoint.for(String(point.id)).fields.id.as("hidden", String(point.id))} />
			{:else}
				<input {...createPoint.fields.templateId.as("hidden", String(templateId))} />
			{/if}
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

			<!-- E.g. when the template was retired in the meantime. -->
			<Field.FieldError errors={fields.issues()} />
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="ghost">{m.common_cancel()}</Button>
					{/snippet}
				</Dialog.Close>
				<SubmitButton pending={form.pending}>{m.checklists_save_point()}</SubmitButton>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
