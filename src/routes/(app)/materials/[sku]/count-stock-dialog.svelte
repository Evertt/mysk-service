<!--
	@component
	A "Count / adjust" button opening a dialog to enter a material's stock as counted, with the
	reason it differs. The server records the difference with the recorded stock as an adjustment.
-->
<script lang="ts">
	import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
	import { toast } from "svelte-sonner";

	import NumberField from "#lib/components/form/number-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { formatQuantity } from "#lib/components/materials/display.js";
	import { type MaterialUnit, quantityStep } from "#lib/models.js";

	import { countStock } from "../materials.remote.js";
	import { formatChange } from "./stock-history.js";

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
				Count / adjust
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Count {material.name}</Dialog.Title>
			<Dialog.Description>
				{formatQuantity(material.stock, material.unit)} is recorded as in stock. Enter what you counted;
				the difference is recorded as an adjustment.
			</Dialog.Description>
		</Dialog.Header>
		<form
			{...countStock.enhance(async ({ element, submit }) => {
				// Otherwise the fields show what's wrong.
				if (await submit()) {
					element.reset();
					open = false;
					toast.success("Stock adjusted");
				}
			})}
			class="flex flex-col gap-6"
		>
			<input {...countStock.fields.id.as("hidden", String(material.id))} />
			<Field.FieldGroup>
				<NumberField
					field={countStock.fields.counted}
					label="Counted ({material.unit})"
					value={material.stock}
					min={0}
					step={quantityStep(material.unit)}
					description={difference
						? `Records ${formatChange(difference, material.unit)}.`
						: "The same as recorded."}
				/>
				<TextField
					field={countStock.fields.note}
					label="Reason"
					placeholder="E.g. yearly count, damaged in storage"
				/>
			</Field.FieldGroup>
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="outline">Cancel</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit" disabled={!!countStock.pending}>
					{#if countStock.pending}
						<Spinner data-icon="inline-start" />
					{/if}
					Adjust stock
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
