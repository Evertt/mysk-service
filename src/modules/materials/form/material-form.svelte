<!--
	@component
	The material form, for creating (`createMaterial`) and editing (`updateMaterial`, with
	`material`) a material.
-->
<script lang="ts">
	import FormSection from "#lib/components/form/form-section.svelte";
	import MoneyField from "#lib/components/form/money-field.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import RecordForm from "#lib/components/form/record-form.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { formatNumber, label } from "#lib/i18n/index.ts";

	import { lowStockThreshold } from "../display.ts";
	import { materialLabels } from "../labels.ts";
	import type { createMaterial, getMaterial, updateMaterial } from "../material.remote.ts";
	import { type MaterialUnit, materialUnits, quantityStep } from "../model.ts";

	type Material = Awaited<ReturnType<typeof getMaterial>>["material"];

	// A new material's form has its opening stock too.
	let props: { cancelHref: string } & (
		| { form: typeof createMaterial; material?: undefined }
		| { form: typeof updateMaterial; material: Material }
	) = $props();

	const { form, material, cancelHref } = $derived(props);
	const fields = $derived(form.fields);

	const unitOptions = materialUnits.map((value) => ({
		value,
		label: m.materials_unit_option({
			name: materialLabels.label("materialUnit", value),
			symbol: materialLabels.label("materialUnitSymbol", value),
		}),
	}));
	// Pieces are counted whole; other units to two decimals.
	const unit = $derived((fields.unit.value() || material?.unit || "pcs") as MaterialUnit);
	const stockDescription = m.materials_form_opening_stock_description({
		pieces: formatNumber(lowStockThreshold("pcs")),
		other: formatNumber(lowStockThreshold("m")),
	});
</script>

<RecordForm
	{form}
	record={material}
	snapshot="material"
	submitLabel={material ? m.materials_form_save() : m.materials_form_create()}
	done={material ? m.materials_saved() : m.materials_created()}
	{cancelHref}
>
	<FormSection
		title={m.materials_material()}
		description={material
			? m.materials_form_sku_fixed({ sku: material.sku })
			: m.materials_form_sku_assigned()}
	>
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
		{#if !props.material}
			<!-- Only a new material takes its stock; after that it changes through movements. -->
			<NumberField
				field={props.form.fields.stock}
				label={m.materials_form_opening_stock()}
				value={0}
				min={0}
				step={quantityStep(unit)}
				description={stockDescription}
			/>
		{/if}
	</FormSection>
</RecordForm>
