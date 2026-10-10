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
	import { formatNumber, label } from "#lib/i18n/index.ts";
	import { type MaterialUnit, materialUnits, quantityStep } from "#lib/models.ts";

	import { lowStockThreshold } from "../display.ts";
	import type { createMaterial, getMaterial, updateMaterial } from "../material.remote.ts";

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
		label: m.materials_unit_option({
			name: label("materialUnit", value),
			symbol: label("materialUnitSymbol", value),
		}),
	}));
	// Pieces are counted whole; other units to two decimals.
	const unit = $derived((fields.unit.value() || material?.unit || "pcs") as MaterialUnit);
	const stockDescription = m.materials_form_opening_stock_description({
		pieces: formatNumber(lowStockThreshold("pcs")),
		other: formatNumber(lowStockThreshold("m")),
	});
</script>

<form
	{...form.enhance(async ({ submit }) => {
		// On success the server redirects to the material; otherwise the fields show what's wrong.
		if (await submit()) toast.success(material ? m.materials_saved() : m.materials_created());
	})}
	class="flex flex-col gap-6"
>
	{#if material}
		<!-- Only the edit form has an id field. -->
		<input {...(form as typeof updateMaterial).fields.id.as("hidden", String(material.id))} />
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.materials_material()}</Card.Title>
			<Card.Description>
				{material
					? m.materials_form_sku_fixed({ sku: material.sku })
					: m.materials_form_sku_assigned()}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				<TextField
					field={fields.name}
					label={m.materials_name()}
					value={material?.name}
					class="md:col-span-2"
				/>
				<SelectField
					field={fields.unit}
					label={m.materials_unit()}
					value={material?.unit ?? "pcs"}
					options={unitOptions}
					description={m.materials_form_unit_description()}
				/>
				<MoneyField
					field={fields.unitPrice}
					label={m.materials_unit_price()}
					cents={material?.unitPrice}
					description={m.materials_form_price_description()}
				/>
				{#if !material}
					<!-- Only a new material takes its stock; after that it changes through movements. -->
					<NumberField
						field={(form as typeof createMaterial).fields.stock}
						label={m.materials_form_opening_stock()}
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
		submitLabel={material ? m.materials_form_save() : m.materials_form_create()}
		{cancelHref}
	/>
</form>
