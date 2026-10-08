<!--
	@component
	The equipment form, for registering (`createEquipment`) and editing (`updateEquipment`, with
	`unit`) a unit.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import FormActions from "#lib/components/form/form-actions.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { toDateInput } from "#lib/dates.ts";
	import { categories } from "#lib/equipment/display.ts";
	import { labelOptions } from "#lib/i18n/labels.ts";
	import { equipmentCategories, equipmentStatuses } from "#lib/models.ts";

	import type {
		createEquipment,
		getEquipment,
		getEquipmentFormOptions,
		updateEquipment,
	} from "./equipment.remote.ts";

	type Options = Awaited<ReturnType<typeof getEquipmentFormOptions>>;
	type Unit = Awaited<ReturnType<typeof getEquipment>>["unit"];

	let {
		form,
		options,
		unit,
		orderCount = 0,
		cancelHref,
	}: {
		form: typeof createEquipment | typeof updateEquipment;
		options: Options;
		unit?: Unit;
		/** Orders on the unit being edited; with any, it can't move to another customer. */
		orderCount?: number;
		cancelHref: string;
	} = $props();

	const fields = $derived(form.fields);
</script>

<form
	{...form.enhance(async ({ submit }) => {
		// On success the server redirects to the unit; otherwise the fields show what's wrong.
		if (await submit()) toast.success(unit ? m.equipment_saved() : m.equipment_registered());
	})}
	class="flex flex-col gap-6"
>
	{#if unit}
		<!-- Only the edit form has an id field. -->
		<input {...(form as typeof updateEquipment).fields.id.as("hidden", String(unit.id))} />
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.equipment_form_unit()}</Card.Title>
			<Card.Description>{m.equipment_form_unit_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				<TextField
					field={fields.serialNumber}
					label={m.equipment_field_serial_number()}
					value={unit?.serialNumber}
					autocomplete="off"
					description={m.equipment_field_serial_number_description()}
				/>
				<SelectField
					field={fields.status}
					label={m.equipment_field_status()}
					value={unit?.status ?? "operational"}
					options={labelOptions("equipmentStatus", equipmentStatuses)}
				/>
				<TextField
					field={fields.manufacturer}
					label={m.equipment_field_manufacturer()}
					value={unit?.manufacturer}
				/>
				<TextField field={fields.model} label={m.equipment_field_model()} value={unit?.model} />
				<SelectField
					field={fields.category}
					label={m.equipment_field_category()}
					placeholder={m.equipment_category_placeholder()}
					value={unit?.category}
					options={equipmentCategories.map((value) => ({
						value,
						label: categories[value].label,
					}))}
				/>
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.equipment_form_owner()}</Card.Title>
			<Card.Description>{m.equipment_form_owner_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				<SelectField
					field={fields.customerId}
					label={m.equipment_field_customer()}
					placeholder={m.equipment_customer_placeholder()}
					value={unit ? String(unit.customerId) : ""}
					options={options.customers.map((c) => ({
						value: String(c.id),
						label: `${c.name} (${c.code})`,
					}))}
					description={orderCount ? m.equipment_customer_locked({ count: orderCount }) : undefined}
					class="md:col-span-2"
				/>
				<TextField
					field={fields.installedAt}
					label={m.equipment_field_installed()}
					type="date"
					value={toDateInput(unit?.installedAt)}
				/>
				<TextField
					field={fields.warrantyUntil}
					label={m.equipment_field_warranty()}
					type="date"
					value={toDateInput(unit?.warrantyUntil)}
				/>
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<FormActions
		pending={form.pending}
		submitLabel={unit ? m.equipment_save() : m.equipment_register()}
		{cancelHref}
	/>
</form>
