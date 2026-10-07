<!--
	@component
	The material form, for creating (`createMaterial`) and editing (`updateMaterial`, with
	`material`) a material.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import FormActions from "#lib/components/form/form-actions.svelte";
	import MoneyField from "#lib/components/form/money-field.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { lowStockThreshold } from "#lib/components/materials/display.js";
	import { label } from "#lib/i18n/labels.js";
	import { type MaterialUnit, materialUnits, quantityStep } from "#lib/models.js";

	import type { createMaterial, getMaterial, updateMaterial } from "./materials.remote.js";

	type Material = Awaited<ReturnType<typeof getMaterial>>["material"];

	let {
		form,
		material,
		cancelHref,
	}: {
		form: typeof createMaterial | typeof updateMaterial;
		material?: Material;
		cancelHref: string;
	} = $props();

	const fields = $derived(form.fields);

	const unitOptions = materialUnits.map((value) => ({
		value,
		label: `${label("materialUnit", value)} (${label("materialUnitSymbol", value)})`,
	}));
	// Pieces are counted whole; other units to two decimals.
	const unit = $derived((fields.unit.value() || material?.unit || "pcs") as MaterialUnit);
	const stockDescription = `What's in stock now, recorded as the opening balance. Shown as low below ${lowStockThreshold("pcs")} pieces, or ${lowStockThreshold("m")} of other units.`;
</script>

<form
	{...form.enhance(async ({ submit }) => {
		// On success the server redirects to the material; otherwise the fields show what's wrong.
		if (await submit()) toast.success(material ? "Material saved" : "Material created");
	})}
	class="flex flex-col gap-6"
>
	{#if material}
		<!-- Only the edit form has an id field. -->
		<input {...(form as typeof updateMaterial).fields.id.as("hidden", String(material.id))} />
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>Material</Card.Title>
			<Card.Description>
				{material
					? `SKU ${material.sku}; the SKU can't be changed.`
					: "The SKU is assigned when you create the material."}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				<TextField field={fields.name} label="Name" value={material?.name} class="md:col-span-2" />
				<SelectField
					field={fields.unit}
					label="Unit"
					value={material?.unit ?? "pcs"}
					options={unitOptions}
					description="Order quantities and stock are counted in this unit."
				/>
				<MoneyField
					field={fields.unitPrice}
					label="Unit price"
					cents={material?.unitPrice}
					description="List price per unit. Existing orders keep the price they were quoted."
				/>
				{#if !material}
					<!-- Only a new material takes its stock; after that it changes through movements. -->
					<NumberField
						field={(form as typeof createMaterial).fields.stock}
						label="Opening stock"
						value={0}
						min={0}
						step={quantityStep(unit)}
						description={stockDescription}
					/>
				{/if}
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<FormActions
		pending={form.pending}
		submitLabel={material ? "Save material" : "Create material"}
		{cancelHref}
	/>
</form>
