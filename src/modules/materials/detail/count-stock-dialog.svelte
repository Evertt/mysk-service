<!--
	@component
	A "Count / adjust" button opening a dialog to enter a material's stock as counted, with the
	reason it differs. The server records the difference with the recorded stock as an adjustment.
-->
<script lang="ts">
	import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";

	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { label } from "#lib/i18n/index.ts";

	import { formatQuantity } from "../display.ts";
	import { materialLabels } from "../labels.ts";
	import { type MaterialUnit, quantityStep } from "../model.ts";
	import { formatChange } from "./stock-history.ts";
	import { countStock } from "./stock.remote.ts";

	let { material }: { material: { id: number; name: string; unit: MaterialUnit; stock: number } } =
		$props();

	const counted = $derived(countStock.fields.counted.value());
	const difference = $derived(
		typeof counted === "number" && !Number.isNaN(counted) ? counted - material.stock : 0,
	);
</script>

<FormDialog
	form={countStock}
	title={m.materials_count_title({ name: material.name })}
	description={m.materials_count_description({
		quantity: formatQuantity(material.stock, material.unit),
	})}
	submitLabel={m.materials_count_submit()}
	hidden={{ id: String(material.id) }}
	reset
	done={m.materials_count_done()}
>
	{#snippet trigger(props)}
		<Button {...props} variant="outline">
			<ClipboardCheckIcon data-icon="inline-start" />
			{m.materials_count_button()}
		</Button>
	{/snippet}
	<Field.FieldGroup>
		<NumberField
			field={countStock.fields.counted}
			label={m.materials_count_counted({
				unit: materialLabels.label("materialUnitSymbol", material.unit),
			})}
			value={material.stock}
			min={0}
			step={quantityStep(material.unit)}
			description={difference
				? m.materials_count_records({ change: formatChange(difference, material.unit) })
				: m.materials_count_same()}
		/>
		<TextField
			field={countStock.fields.note}
			label={m.materials_count_reason()}
			placeholder={m.materials_count_reason_placeholder()}
		/>
	</Field.FieldGroup>
</FormDialog>
