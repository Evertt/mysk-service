<!--
	@component
	The equipment form, for registering (`createEquipment`) and editing (`updateEquipment`, with
	`unit`) a unit.
-->
<script lang="ts">
	import FormSection from "#lib/components/form/form-section.svelte";
	import RecordForm from "#lib/components/form/record-form.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { labelOptions } from "#lib/i18n/index.ts";
	import { equipmentStatuses } from "#lib/models.ts";

	import type {
		createEquipment,
		getEquipment,
		getEquipmentFormOptions,
		updateEquipment,
	} from "../equipment.remote.ts";
	import { newLocationToken } from "./equipment-schema.ts";

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

	// The site is one of the chosen customer's (also when the snapshot brings one back).
	let customerId = $derived(fields.customerId.value() ?? (unit ? String(unit.customerId) : ""));
	const sitesOf = (customer: string) =>
		options.sites.filter((site) => String(site.customerId) === customer);
	// Reset when the customer changes: to their only site, if they have one.
	let siteId = $derived(fields.siteId.value() ?? (unit ? String(unit.siteId) : ""));
	const siteOptions = $derived(
		sitesOf(customerId).map((site) => ({
			value: String(site.id),
			label: site.name.includes(site.city) ? site.name : `${site.name} (${site.city})`,
		})),
	);
	// The location is one of the chosen site's, or a new one there; none when the site changes.
	let locationId = $derived(
		fields.locationId.value() ?? (unit?.locationId ? String(unit.locationId) : ""),
	);
	const locationOptions = $derived([
		...options.locations
			.filter((location) => String(location.siteId) === siteId)
			.map((location) => ({ value: String(location.id), label: location.name })),
		{ value: newLocationToken, label: m.equipment_location_add_option() },
	]);
</script>

<RecordForm
	{form}
	record={unit}
	snapshot="equipment"
	submitLabel={unit ? m.equipment_save() : m.equipment_register()}
	done={unit ? m.equipment_saved() : m.equipment_registered()}
	{cancelHref}
>
	<FormSection title={m.equipment_form_unit()} description={m.equipment_form_unit_description()}>
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
		<TextField
			field={fields.name}
			label={m.equipment_field_name()}
			value={unit?.name}
			autocomplete="off"
			description={m.equipment_field_name_description()}
		/>
		<!-- The tenant's own categories, in their order. -->
		<SelectField
			field={fields.categoryId}
			label={m.equipment_field_category()}
			placeholder={m.equipment_category_placeholder()}
			value={unit ? String(unit.categoryId) : undefined}
			options={options.categories.map((category) => ({
				value: String(category.id),
				label: category.name,
			}))}
			description={options.categories.length ? undefined : m.equipment_category_none()}
		/>
	</FormSection>

	<FormSection title={m.equipment_form_owner()} description={m.equipment_form_owner_description()}>
		<SelectField
			field={fields.customerId}
			label={m.equipment_field_customer()}
			placeholder={m.equipment_customer_placeholder()}
			value={customerId}
			options={options.customers.map((c) => ({
				value: String(c.id),
				label: `${c.name} (${c.code})`,
			}))}
			onchange={(value: string) => {
				customerId = value;
				const sites = sitesOf(value);
				siteId = sites.length === 1 ? String(sites[0].id) : "";
				locationId = "";
			}}
			description={orderCount ? m.equipment_customer_locked({ count: orderCount }) : undefined}
			class="md:col-span-2"
		/>
		<SelectField
			field={fields.siteId}
			label={m.equipment_field_site()}
			placeholder={customerId ? m.equipment_site_placeholder() : m.equipment_site_choose_customer()}
			value={siteId}
			options={siteOptions}
			onchange={(value: string) => {
				siteId = value;
				locationId = "";
			}}
		/>
		<SelectField
			field={fields.locationId}
			label={m.equipment_field_location()}
			placeholder={m.equipment_location_none()}
			value={locationId}
			options={siteId ? locationOptions : []}
			onchange={(value: string) => (locationId = value)}
			description={m.equipment_field_location_description()}
		/>
		{#if locationId === newLocationToken}
			<TextField
				field={fields.newLocationName}
				label={m.equipment_field_new_location()}
				autocomplete="off"
				description={m.equipment_field_new_location_description()}
				class="md:col-span-2"
			/>
		{/if}
		<TextField
			field={fields.installedAt}
			label={m.equipment_field_installed()}
			type="date"
			value={unit?.installedAt.toString() ?? ""}
		/>
		<TextField
			field={fields.warrantyUntil}
			label={m.equipment_field_warranty()}
			type="date"
			value={unit?.warrantyUntil.toString() ?? ""}
		/>
	</FormSection>
</RecordForm>
