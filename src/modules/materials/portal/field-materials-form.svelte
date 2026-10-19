<!--
	@component
	The materials used on a job, in the engineer portal: add, change or remove lines and save them,
	which takes them from (or returns them to) stock like the office's order form does.
-->
<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import { label } from "#lib/i18n/index.ts";

	import { materialLabels } from "../labels.ts";
	import { quantityStep } from "../model.ts";
	import {
		getUsableMaterials,
		saveFieldMaterials as saveMaterials,
	} from "./field-materials.remote.ts";

	let {
		orderId,
		lines: saved,
	}: { orderId: number; lines: { materialId: number; quantity: number }[] } = $props();

	const materials = $derived(await getUsableMaterials());
	const units = $derived(
		new Map(materials.map((material) => [String(material.id), material.unit])),
	);

	// Kept here so lines can be added and removed; the inputs' names make them part of the form.
	const initialLines = () =>
		saved.map((line) => ({
			key: crypto.randomUUID(),
			materialId: String(line.materialId),
			quantity: line.quantity,
		}));
	let lines = $state(initialLines());

	const fields = $derived(saveMaterials.fields);

	function withoutValue<T extends { value?: unknown }>({ value: _value, ...attributes }: T) {
		return attributes;
	}
</script>

<form
	{...saveMaterials.enhance(async ({ submit }) => {
		if (await submitted(submit)) toast.success(m.materials_portal_saved());
	})}
	class="flex flex-col gap-4"
>
	<input {...saveMaterials.fields.id.as("hidden", String(orderId))} />
	{#each lines as line, index (line.key)}
		{@const lineFields = fields.lines[index]}
		{@const unit = units.get(line.materialId)}
		<div class="flex flex-col gap-2 rounded-lg border p-3" data-line>
			<NativeSelect.Root
				class="h-11 w-full"
				aria-label={m.materials_portal_material()}
				{...withoutValue(lineFields.materialId.as("select"))}
				value={line.materialId}
				onchange={(event) => (line.materialId = event.currentTarget.value)}
			>
				<NativeSelect.Option value="">{m.materials_portal_choose()}</NativeSelect.Option>
				{#each materials as material (material.id)}
					<NativeSelect.Option value={String(material.id)}>
						{material.name} ({material.sku})
					</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
			<div class="flex items-center gap-2">
				<InputGroup.Root class="h-11 flex-1">
					<InputGroup.Input
						aria-label={m.materials_portal_quantity()}
						inputmode="decimal"
						min={quantityStep(unit ?? "m")}
						step={quantityStep(unit ?? "m")}
						class="tabular-nums"
						{...withoutValue(lineFields.quantity.as("number"))}
						value={line.quantity}
						oninput={(event) => (line.quantity = Number(event.currentTarget.value))}
					/>
					<InputGroup.Addon align="inline-end">
						<InputGroup.Text
							>{unit ? materialLabels.label("materialUnitSymbol", unit) : ""}</InputGroup.Text
						>
					</InputGroup.Addon>
				</InputGroup.Root>
				<Button
					type="button"
					variant="outline"
					size="icon-lg"
					aria-label={m.materials_portal_remove()}
					onclick={() => lines.splice(index, 1)}
				>
					<Trash2Icon />
				</Button>
			</div>
			<Field.FieldError errors={lineFields.allIssues()} />
		</div>
	{:else}
		<p class="text-sm text-muted-foreground">{m.materials_portal_none_yet()}</p>
	{/each}
	<Field.FieldError errors={saveMaterials.fields.issues()} />
	<div class="grid grid-cols-2 gap-2">
		<Button
			type="button"
			variant="outline"
			size="lg"
			onclick={() => lines.push({ key: crypto.randomUUID(), materialId: "", quantity: 1 })}
		>
			<PlusIcon data-icon="inline-start" />
			{m.materials_portal_add()}
		</Button>
		<SubmitButton size="lg" pending={saveMaterials.pending}>
			{m.materials_portal_save()}
		</SubmitButton>
	</div>
</form>
