<!--
	@component
	The materials card of the order form: the order's lines, to add to and remove from, and their
	total. The inputs' names (from the form's `field`) make the lines part of the submission.
-->
<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import { formatCents } from "#lib/i18n/format.ts";
	import { label } from "#lib/i18n/labels.ts";
	import { lineTotal, quantityStep } from "#lib/models.ts";

	import type { createOrder, getOrder, getOrderFormOptions, updateOrder } from "./order.remote.ts";

	let {
		field,
		materials,
		order,
	}: {
		/** The form's `lines` field. */
		field: (typeof createOrder)["fields"]["lines"] | (typeof updateOrder)["fields"]["lines"];
		materials: Awaited<ReturnType<typeof getOrderFormOptions>>["materials"];
		/** The order being edited: its lines are the initial ones, at the price they were quoted at. */
		order?: Awaited<ReturnType<typeof getOrder>>["order"];
	} = $props();

	// Kept here so rows can be added and removed.
	const initialLines = () =>
		order?.lines.map((line) => ({
			key: crypto.randomUUID(),
			materialId: String(line.materialId),
			quantity: line.quantity,
		})) ?? [];
	let lines = $state(initialLines());
	const materialsById = $derived(
		new Map(materials.map((material) => [String(material.id), material])),
	);
	const quotedPrices = $derived(
		new Map(order?.lines.map((line) => [String(line.materialId), line.unitPrice])),
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
		<Card.Title>{m.orders_materials()}</Card.Title>
		<Card.Description>
			{order ? m.orders_materials_quoted() : m.orders_materials_list_price()}
		</Card.Description>
		<Card.Action>
			<Button type="button" variant="outline" size="sm" onclick={addLine}>
				<PlusIcon data-icon="inline-start" />
				{m.orders_add_material()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		{#if lines.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.orders_line_material()}</Table.Head>
						<Table.Head class="w-28">{m.orders_line_quantity()}</Table.Head>
						<Table.Head class="text-right">{m.orders_line_amount()}</Table.Head>
						<Table.Head class="w-10"
							><span class="sr-only">{m.orders_line_remove()}</span></Table.Head
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
									aria-label={m.orders_line_material()}
									{...withoutValue(lineFields.materialId.as("select"))}
									value={line.materialId}
									onchange={(event) => (line.materialId = event.currentTarget.value)}
								>
									<NativeSelect.Option value="">{m.orders_choose_material()}</NativeSelect.Option>
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
										aria-label={m.orders_line_quantity()}
										min={step}
										{step}
										class="tabular-nums"
										{...withoutValue(lineFields.quantity.as("number"))}
										value={line.quantity}
										oninput={(event) => (line.quantity = Number(event.currentTarget.value))}
									/>
									<InputGroup.Addon align="inline-end">
										<InputGroup.Text
											>{unit ? label("materialUnitSymbol", unit) : ""}</InputGroup.Text
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
									aria-label={m.orders_line_remove_line()}
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
						<Table.Cell colspan={2}>{m.orders_materials_total()}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatCents(materialsTotal)}</Table.Cell>
						<Table.Cell></Table.Cell>
					</Table.Row>
				</Table.Footer>
			</Table.Root>
			<Field.FieldError errors={field.allIssues()} />
		{:else}
			<p class="text-sm text-muted-foreground">{m.orders_no_materials_yet()}</p>
		{/if}
	</Card.Content>
</Card.Root>
