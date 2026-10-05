<!--
	@component
	The order form, for creating (`createOrder`) and editing (`updateOrder`, with `order`) an order.
-->
<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";

	import FormActions from "#lib/components/form/form-actions.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { formatCents, humanize } from "#lib/format.js";
	import { orderPriorities, orderStatuses, orderTypes } from "#lib/models.js";
	import { toDateInput } from "#lib/schema.js";

	import type { createOrder, getOrder, getOrderFormOptions, updateOrder } from "./orders.remote.js";

	type Options = Awaited<ReturnType<typeof getOrderFormOptions>>;
	type Order = Awaited<ReturnType<typeof getOrder>>["order"];

	let {
		form,
		options,
		order,
		cancelHref,
	}: {
		form: typeof createOrder | typeof updateOrder;
		options: Options;
		order?: Order;
		cancelHref: string;
	} = $props();

	const fields = $derived(form.fields);

	const enumOptions = (values: readonly string[]) =>
		values.map((value) => ({ value, label: humanize(value) }));

	// Equipment is limited to the chosen customer's units.
	let customerId = $derived(order ? String(order.customerId) : "");
	const equipmentOptions = $derived(
		options.equipments
			.filter((unit) => String(unit.customerId) === customerId)
			.map((unit) => ({
				value: String(unit.id),
				label: `${unit.manufacturer} ${unit.model} · ${unit.serialNumber}`,
			})),
	);
	const engineerOptions = $derived(
		options.engineers
			.filter((engineer) => engineer.active || engineer.id === order?.engineerId)
			.map((engineer) => ({
				value: String(engineer.id),
				label: engineer.name,
				group: humanize(engineer.specialty),
			})),
	);

	// Material lines are kept here so rows can be added and removed; the inputs' names (from the
	// form's fields) make them part of the submission.
	const initialLines = () =>
		order?.lines.map((line) => ({
			key: crypto.randomUUID(),
			materialId: String(line.materialId),
			quantity: line.quantity,
		})) ?? [];
	let lines = $state(initialLines());
	const materials = $derived(new Map(options.materials.map((m) => [String(m.id), m])));
	const quotedPrices = $derived(
		new Map(order?.lines.map((line) => [String(line.materialId), line.unitPrice])),
	);
	const unitPrice = (materialId: string) =>
		quotedPrices.get(materialId) ?? materials.get(materialId)?.unitPrice ?? 0;
	const materialsTotal = $derived(
		lines.reduce((sum, line) => sum + line.quantity * unitPrice(line.materialId), 0),
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

<form
	{...form.enhance(async ({ submit }) => {
		// On success the server redirects to the order; otherwise the fields show what's wrong.
		if (await submit()) toast.success(order ? "Order saved" : "Order created");
	})}
	class="flex flex-col gap-6"
>
	{#if order}
		<!-- Only the edit form has an id field. -->
		<input {...(form as typeof updateOrder).fields.id.as("hidden", String(order.id))} />
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>Work</Card.Title>
			<Card.Description>Who it's for, what needs doing and who does it.</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				<SelectField
					field={fields.customerId}
					label="Customer"
					placeholder="Choose a customer"
					value={customerId}
					options={options.customers.map((c) => ({
						value: String(c.id),
						label: `${c.name} (${c.code})`,
					}))}
					onchange={(value: string) => (customerId = value)}
				/>
				<SelectField
					field={fields.equipmentId}
					label="Equipment"
					placeholder={customerId ? "None (new installation)" : "Choose a customer first"}
					value={order?.equipmentId ? String(order.equipmentId) : ""}
					options={equipmentOptions}
				/>
				<SelectField
					field={fields.type}
					label="Type"
					value={order?.type ?? "maintenance"}
					options={enumOptions(orderTypes)}
				/>
				<SelectField
					field={fields.priority}
					label="Priority"
					value={order?.priority ?? "normal"}
					options={enumOptions(orderPriorities)}
				/>
				<TextField
					field={fields.description}
					label="Description"
					value={order?.description}
					multiline
					class="md:col-span-2"
				/>
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Planning</Card.Title>
			<Card.Description>Status, schedule and the engineer doing the work.</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				<SelectField
					field={fields.status}
					label="Status"
					value={order?.status ?? "quote"}
					options={enumOptions(orderStatuses)}
				/>
				<SelectField
					field={fields.engineerId}
					label="Engineer"
					placeholder="Unassigned"
					value={order?.engineerId ? String(order.engineerId) : ""}
					options={engineerOptions}
				/>
				<TextField
					field={fields.scheduledFor}
					label="Scheduled for"
					type="date"
					value={toDateInput(order?.scheduledFor)}
				/>
				<NumberField
					field={fields.laborHours}
					label="Labour (hours)"
					value={order?.laborHours ?? 0}
					min={0}
					step={0.25}
				/>
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Materials</Card.Title>
			<Card.Description>
				{order
					? "Existing lines keep the price they were quoted at."
					: "Priced at today's list price."}
			</Card.Description>
			<Card.Action>
				<Button type="button" variant="outline" size="sm" onclick={addLine}>
					<PlusIcon data-icon="inline-start" />
					Add material
				</Button>
			</Card.Action>
		</Card.Header>
		<Card.Content>
			{#if lines.length}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Material</Table.Head>
							<Table.Head class="w-28">Quantity</Table.Head>
							<Table.Head class="text-right">Amount</Table.Head>
							<Table.Head class="w-10"><span class="sr-only">Remove</span></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each lines as line, index (line.key)}
							{@const lineFields = fields.lines[index]}
							<Table.Row>
								<Table.Cell>
									<NativeSelect.Root
										class="w-full"
										aria-label="Material"
										{...withoutValue(lineFields.materialId.as("select"))}
										value={line.materialId}
										onchange={(event) => (line.materialId = event.currentTarget.value)}
									>
										<NativeSelect.Option value="">Choose a material</NativeSelect.Option>
										{#each options.materials as material (material.id)}
											<NativeSelect.Option value={String(material.id)}>
												{material.name} ({material.sku})
											</NativeSelect.Option>
										{/each}
									</NativeSelect.Root>
								</Table.Cell>
								<Table.Cell>
									<InputGroup.Root>
										<InputGroup.Input
											aria-label="Quantity"
											min={1}
											class="tabular-nums"
											{...withoutValue(lineFields.quantity.as("number"))}
											value={line.quantity}
											oninput={(event) => (line.quantity = Number(event.currentTarget.value))}
										/>
										<InputGroup.Addon align="inline-end">
											<InputGroup.Text>{materials.get(line.materialId)?.unit ?? ""}</InputGroup.Text
											>
										</InputGroup.Addon>
									</InputGroup.Root>
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{formatCents(line.quantity * unitPrice(line.materialId))}
								</Table.Cell>
								<Table.Cell>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label="Remove line"
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
							<Table.Cell colspan={2}>Materials total</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{formatCents(materialsTotal)}</Table.Cell>
							<Table.Cell></Table.Cell>
						</Table.Row>
					</Table.Footer>
				</Table.Root>
				<Field.FieldError errors={fields.lines.allIssues()} />
			{:else}
				<p class="text-sm text-muted-foreground">No materials on this order yet.</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<FormActions
		pending={form.pending}
		submitLabel={order ? "Save order" : "Create order"}
		{cancelHref}
	/>
</form>
