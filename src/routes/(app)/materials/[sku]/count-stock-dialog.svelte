<!--
	@component
	A "Count / adjust" button opening a dialog to enter a material's stock as counted, with the
	reason it differs. The server records the difference with the recorded stock as an adjustment.
-->
<script lang="ts">
	import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
	import { toast } from "svelte-sonner";

	import NumberField from "#lib/components/form/number-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { label } from "#lib/i18n/labels.js";
	import { formatQuantity } from "#lib/materials/display.js";
	import { type MaterialUnit, quantityStep } from "#lib/models.js";

	import { formatChange } from "./stock-history.js";
	import { countStock } from "./stock.remote.js";

	let { material }: { material: { id: number; name: string; unit: MaterialUnit; stock: number } } =
		$props();

	let open = $state(false);

	const counted = $derived(countStock.fields.counted.value());
	const difference = $derived(
		typeof counted === "number" && !Number.isNaN(counted) ? counted - material.stock : 0,
	);
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline">
				<ClipboardCheckIcon data-icon="inline-start" />
				{m.materials_count_button()}
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.materials_count_title({ name: material.name })}</Dialog.Title>
			<Dialog.Description>
				{m.materials_count_description({
					quantity: formatQuantity(material.stock, material.unit),
				})}
			</Dialog.Description>
		</Dialog.Header>
		<form
			{...countStock.enhance(async ({ element, submit }) => {
				// Otherwise the fields show what's wrong.
				if (await submit()) {
					element.reset();
					open = false;
					toast.success(m.materials_count_done());
				}
			})}
			class="flex flex-col gap-6"
		>
			<input {...countStock.fields.id.as("hidden", String(material.id))} />
			<Field.FieldGroup>
				<NumberField
					field={countStock.fields.counted}
					label={m.materials_count_counted({ unit: label("materialUnitSymbol", material.unit) })}
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
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="outline">{m.common_cancel()}</Button>
					{/snippet}
				</Dialog.Close>
				<SubmitButton pending={countStock.pending}>{m.materials_count_submit()}</SubmitButton>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
