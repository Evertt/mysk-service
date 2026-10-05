<!--
	@component
	The equipment form, for registering (`createEquipment`) and editing (`updateEquipment`, with
	`unit`) a unit.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import { categories } from "#lib/components/equipment/display.js";
	import FormActions from "#lib/components/form/form-actions.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { humanize } from "#lib/format.js";
	import { equipmentCategories, equipmentStatuses } from "#lib/models.js";
	import { toDateInput } from "#lib/schema.js";

	import type {
		createEquipment,
		getEquipment,
		getEquipmentFormOptions,
		updateEquipment,
	} from "./equipment.remote.js";

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
		if (await submit()) toast.success(unit ? "Equipment saved" : "Equipment registered");
	})}
	class="flex flex-col gap-6"
>
	{#if unit}
		<!-- Only the edit form has an id field. -->
		<input {...(form as typeof updateEquipment).fields.id.as("hidden", String(unit.id))} />
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>Unit</Card.Title>
			<Card.Description>What the machine is and the state it's in.</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				<TextField
					field={fields.serialNumber}
					label="Serial number"
					value={unit?.serialNumber}
					autocomplete="off"
					description="Letters, digits and dashes; stored in upper case."
				/>
				<SelectField
					field={fields.status}
					label="Status"
					value={unit?.status ?? "operational"}
					options={equipmentStatuses.map((value) => ({ value, label: humanize(value) }))}
				/>
				<TextField field={fields.manufacturer} label="Manufacturer" value={unit?.manufacturer} />
				<TextField field={fields.model} label="Model" value={unit?.model} />
				<SelectField
					field={fields.category}
					label="Category"
					placeholder="Choose a category"
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
			<Card.Title>Owner and warranty</Card.Title>
			<Card.Description>Its owner, and how long it's covered.</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				<SelectField
					field={fields.customerId}
					label="Customer"
					placeholder="Choose a customer"
					value={unit ? String(unit.customerId) : ""}
					options={options.customers.map((c) => ({
						value: String(c.id),
						label: `${c.name} (${c.code})`,
					}))}
					description={orderCount
						? `Has ${orderCount === 1 ? "an order" : `${orderCount} orders`} for this customer, so it stays with them.`
						: undefined}
					class="md:col-span-2"
				/>
				<TextField
					field={fields.installedAt}
					label="Installed on"
					type="date"
					value={toDateInput(unit?.installedAt)}
				/>
				<TextField
					field={fields.warrantyUntil}
					label="Warranty until"
					type="date"
					value={toDateInput(unit?.warrantyUntil)}
				/>
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<FormActions
		pending={form.pending}
		submitLabel={unit ? "Save equipment" : "Register equipment"}
		{cancelHref}
	/>
</form>
