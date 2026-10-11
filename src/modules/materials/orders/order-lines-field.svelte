<!--
	@component
	The materials card of the order form (the module's part of it, see `orders.form`): the order's
	lines, to add to and remove from, and their total. The inputs' names (from `field`, under the
	form's `modules.materials`) make the lines part of the order's submission.
-->
<script lang="ts">
	import type { RemoteFormFields } from "$app/server";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import type * as v from "valibot";

	import { formatCents, label } from "#lib/i18n/index.ts";

	import type { materialsPart } from "../form/order-lines-schema.ts";
	import { materialLabels } from "../labels.ts";
	import { lineTotal, quantityStep } from "../model.ts";
	import type { getMaterialOptions, getOrderLines } from "./order-lines.remote.ts";

	let {
		field,
		materials,
		quoted,
	}: {
		/** The lines' field of the materials' part of the order form. */
		field: RemoteFormFields<v.InferInput<typeof materialsPart>>["lines"];
		materials: Awaited<ReturnType<typeof getMaterialOptions>>;
		/** The lines of the order being edited, at the prices they were quoted at; none for a new one. */
		quoted?: Awaited<ReturnType<typeof getOrderLines>>;
	} = $props();

	// Kept here so rows can be added and removed.
	const initialLines = () =>
		quoted?.map((line) => ({
			key: crypto.randomUUID(),
			materialId: String(line.materialId),
			quantity: line.quantity,
		})) ?? [];
	let lines = $state(initialLines());
	const materialsById = $derived(
		new Map(materials.map((material) => [String(material.id), material])),
	);
	const quotedPrices = $derived(
		new Map(quoted?.map((line) => [String(line.materialId), line.unitPrice])),
	);
	const unitPrice = (materialId: string) =>
		quotedPrices.get(materialId) ?? materialsById.get(materialId)?.unitPrice ?? 0;
	const materialsTotal = $derived(
		lines.reduce((sum, line) => sum + lineTotal(line.quantity, unitPrice(line.materialId)), 0),
	);

	// Line inputs take their value from `lines` (rows can be removed, which shifts the indexes), so
	// only the name and validation attributes come from the form field.
	function withoutValue<T extends { value?: unknown }>({ value: _value, ...attributes }: T) {
		return attributes;
	}

	function addLine() {
		lines.push({ key: crypto.randomUUID(), materialId: "", quantity: 1 });
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.materials_order_title()}</Card.Title>
		<Card.Description>
			{quoted ? m.materials_order_quoted() : m.materials_order_list_price()}
		</Card.Description>
		<Card.Action>
			<Button type="button" variant="outline" size="sm" onclick={addLine}>
				<PlusIcon data-icon="inline-start" />
				{m.materials_order_add()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		{#if lines.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.materials_order_line_material()}</Table.Head>
						<Table.Head class="w-28">{m.materials_order_line_quantity()}</Table.Head>
						<Table.Head class="text-right">{m.materials_order_line_amount()}</Table.Head>
						<Table.Head class="w-10"
							><span class="sr-only">{m.materials_order_line_remove()}</span></Table.Head
						>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each lines as line, index (line.key)}
						{@const lineFields = field[index]}
						<Table.Row>
							<Table.Cell>
								<NativeSelect.Root
									class="w-full"
									aria-label={m.materials_order_line_material()}
									{...withoutValue(lineFields.materialId.as("select"))}
									value={line.materialId}
									onchange={(event) => (line.materialId = event.currentTarget.value)}
								>
									<NativeSelect.Option value="">{m.materials_order_choose()}</NativeSelect.Option>
									{#each materials as material (material.id)}
										<NativeSelect.Option value={String(material.id)}>
											{material.name} ({material.sku})
										</NativeSelect.Option>
									{/each}
								</NativeSelect.Root>
							</Table.Cell>
							<Table.Cell>
								<InputGroup.Root>
									{@const unit = materialsById.get(line.materialId)?.unit}
									{@const step = quantityStep(unit ?? "m")}
									<InputGroup.Input
										aria-label={m.materials_order_line_quantity()}
										min={step}
										{step}
										class="tabular-nums"
										{...withoutValue(lineFields.quantity.as("number"))}
										value={line.quantity}
										oninput={(event) => (line.quantity = Number(event.currentTarget.value))}
									/>
									<InputGroup.Addon align="inline-end">
										<InputGroup.Text
											>{unit
												? materialLabels.label("materialUnitSymbol", unit)
												: ""}</InputGroup.Text
										>
									</InputGroup.Addon>
								</InputGroup.Root>
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">
								{formatCents(lineTotal(line.quantity, unitPrice(line.materialId)))}
							</Table.Cell>
							<Table.Cell>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label={m.materials_order_line_remove_line()}
									onclick={() => lines.splice(index, 1)}
								>
									<Trash2Icon />
								</Button>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
				<Table.Footer>
					<Table.Row>
						<Table.Cell colspan={2}>{m.materials_order_total()}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatCents(materialsTotal)}</Table.Cell>
						<Table.Cell></Table.Cell>
					</Table.Row>
				</Table.Footer>
			</Table.Root>
			<Field.FieldError errors={field.allIssues()} />
		{:else}
			<p class="text-sm text-muted-foreground">{m.materials_order_none_yet()}</p>
		{/if}
	</Card.Content>
</Card.Root>
