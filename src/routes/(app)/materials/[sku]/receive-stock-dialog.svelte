<!--
	@component
	A "Receive stock" button opening a dialog that adds received stock (e.g. a delivery) to a
	material, with an optional note.
-->
<script lang="ts">
	import PackagePlusIcon from "@lucide/svelte/icons/package-plus";
	import { toast } from "svelte-sonner";

	import NumberField from "#lib/components/form/number-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { formatQuantity } from "#lib/components/materials/display.js";
	import { type MaterialUnit, quantityStep } from "#lib/models.js";

	import { receiveStock } from "../materials.remote.js";

	let { material }: { material: { id: number; name: string; unit: MaterialUnit; stock: number } } =
		$props();

	let open = $state(false);
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline">
				<PackagePlusIcon data-icon="inline-start" />
				Receive stock
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Receive {material.name}</Dialog.Title>
			<Dialog.Description>
				Adds to the {formatQuantity(material.stock, material.unit)} in stock.
			</Dialog.Description>
		</Dialog.Header>
		<form
			{...receiveStock.enhance(async ({ element, submit }) => {
				// Otherwise the fields show what's wrong.
				if (await submit()) {
					element.reset();
					open = false;
					toast.success("Stock received");
				}
			})}
			class="flex flex-col gap-6"
		>
			<input {...receiveStock.fields.id.as("hidden", String(material.id))} />
			<Field.FieldGroup>
				<NumberField
					field={receiveStock.fields.quantity}
					label="Quantity ({material.unit})"
					min={quantityStep(material.unit)}
					step={quantityStep(material.unit)}
				/>
				<TextField
					field={receiveStock.fields.note}
					label="Note"
					placeholder="E.g. the delivery note's number"
				/>
			</Field.FieldGroup>
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="outline">Cancel</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit" disabled={!!receiveStock.pending}>
					{#if receiveStock.pending}
						<Spinner data-icon="inline-start" />
					{/if}
					Receive
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
