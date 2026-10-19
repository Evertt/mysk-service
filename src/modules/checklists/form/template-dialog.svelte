<!--
	@component
	Adds a checklist template to the tenant's, or edits one's details: its name, the norm it
	inspects by and how long an inspection by it stays valid. A new one opens on its own page, to
	give it points and categories.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import NumberField from "#lib/components/form/number-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import TextField from "#lib/components/form/text-field.svelte";

	import { defaultValidityMonths, validityLimits } from "../model.ts";
	import { addTemplate, saveTemplate } from "../templates.remote.ts";

	let {
		template,
		open = $bindable(false),
	}: {
		/** The template to edit; a new one if not given. */
		template?: { id: number; name: string; norm: string | null; validityMonths: number };
		open?: boolean;
	} = $props();

	const form = $derived(template ? saveTemplate.for(String(template.id)) : addTemplate);
	const fields = $derived(form.fields);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>
				{template ? m.checklists_edit_title({ name: template.name }) : m.checklists_new_title()}
			</Dialog.Title>
			<Dialog.Description>{m.checklists_dialog_description()}</Dialog.Description>
		</Dialog.Header>
		<form
			{...form.enhance(async ({ submit }) => {
				if (!(await submitted(submit))) return;
				open = false;
				toast.success(m.checklists_template_saved());
			})}
			class="flex flex-col gap-6"
		>
			{#if template}
				<input
					{...saveTemplate.for(String(template.id)).fields.id.as("hidden", String(template.id))}
				/>
			{/if}
			<Field.FieldGroup>
				<TextField
					field={fields.name}
					label={m.checklists_field_name()}
					value={template?.name}
					autocomplete="off"
					placeholder={m.checklists_field_name_placeholder()}
				/>
				<TextField
					field={fields.norm}
					label={m.checklists_field_norm()}
					value={template?.norm}
					autocomplete="off"
					placeholder={m.checklists_field_norm_placeholder()}
					description={m.checklists_field_norm_description()}
				/>
				<NumberField
					field={fields.validityMonths}
					label={m.checklists_field_validity_months()}
					value={template?.validityMonths ?? defaultValidityMonths}
					min={validityLimits.min}
					max={validityLimits.max}
					step={1}
					description={m.checklists_field_validity_description()}
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
				<SubmitButton pending={form.pending}>{m.checklists_save_template()}</SubmitButton>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
