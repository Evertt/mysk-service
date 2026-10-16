<!--
	@component
	Adds an equipment category to the tenant's, or edits one: its name, and the specialty of the
	engineers who service its equipment.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import SelectField from "#lib/components/form/select-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { labelOptions } from "#lib/i18n/index.ts";
	import { type EngineerSpecialty, engineerSpecialties } from "#lib/models.ts";
	import { errorMessage } from "#lib/utils.ts";

	import { addEquipmentCategory, updateEquipmentCategory } from "./categories.remote.ts";

	let {
		category,
		open = $bindable(false),
	}: {
		/** The category to edit; a new one if not given. */
		category?: { id: number; name: string; specialty: EngineerSpecialty | null };
		open?: boolean;
	} = $props();

	const form = $derived(
		category ? updateEquipmentCategory.for(String(category.id)) : addEquipmentCategory,
	);
	const fields = $derived(form.fields);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>
				{category
					? m.equipment_category_edit_title({ name: category.name })
					: m.equipment_category_new_title()}
			</Dialog.Title>
			<Dialog.Description>{m.equipment_category_dialog_description()}</Dialog.Description>
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
				if (!category) element.reset();
				toast.success(m.equipment_category_saved());
			})}
			class="flex flex-col gap-6"
		>
			{#if category}
				<input
					{...updateEquipmentCategory
						.for(String(category.id))
						.fields.id.as("hidden", String(category.id))}
				/>
			{/if}
			<Field.FieldGroup>
				<TextField
					field={fields.name}
					label={m.equipment_category_field_name()}
					value={category?.name}
					autocomplete="off"
					description={m.equipment_category_field_name_description()}
				/>
				<SelectField
					field={fields.specialty}
					label={m.equipment_category_field_specialty()}
					placeholder={m.equipment_category_no_specialty()}
					value={category?.specialty}
					options={labelOptions("engineerSpecialty", engineerSpecialties)}
					description={m.equipment_category_field_specialty_description()}
				/>
			</Field.FieldGroup>

			<!-- E.g. when the category was deleted in the meantime. -->
			<Field.FieldError errors={fields.issues()} />
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="ghost">{m.common_cancel()}</Button>
					{/snippet}
				</Dialog.Close>
				<SubmitButton pending={form.pending}>{m.equipment_category_save()}</SubmitButton>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
