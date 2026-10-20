<!--
	@component
	A "Receive stock" button opening a dialog that adds received stock (e.g. a delivery) to a
	material, with an optional note.
-->
<script lang="ts">
	import PackagePlusIcon from "@lucide/svelte/icons/package-plus";

	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { label } from "#lib/i18n/index.ts";

	import { formatQuantity } from "../display.ts";
	import { materialLabels } from "../labels.ts";
	import { type MaterialUnit, quantityStep } from "../model.ts";
	import { receiveStock } from "./stock.remote.ts";

	let { material }: { material: { id: number; name: string; unit: MaterialUnit; stock: number } } =
		$props();
</script>

<FormDialog
	form={receiveStock}
	title={m.materials_receive_title({ name: material.name })}
	description={m.materials_receive_description({
		quantity: formatQuantity(material.stock, material.unit),
	})}
	submitLabel={m.materials_receive_submit()}
	hidden={{ id: String(material.id) }}
	reset
	done={m.materials_receive_done()}
>
	{#snippet trigger(props)}
		<Button {...props} variant="outline">
			<PackagePlusIcon data-icon="inline-start" />
			{m.materials_receive_button()}
		</Button>
	{/snippet}
	<Field.FieldGroup>
		<NumberField
			field={receiveStock.fields.quantity}
			label={m.materials_receive_quantity({
				unit: materialLabels.label("materialUnitSymbol", material.unit),
			})}
			min={quantityStep(material.unit)}
			step={quantityStep(material.unit)}
		/>
		<TextField
			field={receiveStock.fields.note}
			label={m.materials_receive_note()}
			placeholder={m.materials_receive_note_placeholder()}
		/>
	</Field.FieldGroup>
</FormDialog>
