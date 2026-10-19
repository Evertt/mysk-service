<!--
	@component
	The equipment form, for registering (`createEquipment`) and editing (`updateEquipment`, with
	`unit`) a unit.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import FormActions from "#lib/components/form/form-actions.svelte";
	import { formSnapshot } from "#lib/components/form/form-snapshot.ts";
	import SelectField from "#lib/components/form/select-field.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
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
	// What's typed and not saved yet comes back with the page (back button, reload).
	formSnapshot("equipment", () => form);

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

<form
	{...form.enhance(async ({ submit }) => {
		// On success the server redirects to the unit; otherwise the fields show what's wrong.
		if (await submitted(submit))
			toast.success(unit ? m.equipment_saved() : m.equipment_registered());
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
					placeholder={customerId
						? m.equipment_site_placeholder()
						: m.equipment_site_choose_customer()}
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
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<FormActions
		pending={form.pending}
		submitLabel={unit ? m.equipment_save() : m.equipment_register()}
		{cancelHref}
	/>
</form>
