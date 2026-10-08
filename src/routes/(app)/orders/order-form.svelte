<!--
	@component
	The order form, for creating (`createOrder`) and editing (`updateOrder`, with `order`) an order.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import { specialties } from "#lib/components/engineers/display.js";
	import FormActions from "#lib/components/form/form-actions.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { timeOfDay, toDateInput } from "#lib/dates.js";
	import { labelOptions } from "#lib/i18n/labels.js";
	import { manualOrderStatuses, orderPriorities, orderTypes } from "#lib/models.js";

	import OrderLinesField from "./order-lines-field.svelte";
	import type { createOrder, getOrder, getOrderFormOptions, updateOrder } from "./order.remote.js";

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

	// Equipment is limited to the chosen customer's units.
	let customerId = $derived(order ? String(order.customerId) : "");
	// Reset when the customer changes: a select whose value is no longer among its options has no
	// selection at all, and would then be left out of the submission.
	let equipmentId = $derived(order?.equipmentId ? String(order.equipmentId) : "");
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
				group: specialties[engineer.specialty].label,
			})),
	);
</script>

<form
	{...form.enhance(async ({ submit }) => {
		// On success the server redirects to the order; otherwise the fields show what's wrong.
		if (await submit()) toast.success(order ? m.orders_saved() : m.orders_created());
	})}
	class="flex flex-col gap-6"
>
	{#if order}
		<!-- Only the edit form has an id field. -->
		<input {...(form as typeof updateOrder).fields.id.as("hidden", String(order.id))} />
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.orders_form_work()}</Card.Title>
			<Card.Description>{m.orders_form_work_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				<SelectField
					field={fields.customerId}
					label={m.orders_field_customer()}
					placeholder={m.orders_choose_customer()}
					value={customerId}
					options={options.customers.map((c) => ({
						value: String(c.id),
						label: `${c.name} (${c.code})`,
					}))}
					onchange={(value: string) => {
						customerId = value;
						equipmentId = "";
					}}
				/>
				<SelectField
					field={fields.equipmentId}
					label={m.orders_field_equipment()}
					placeholder={customerId ? m.orders_equipment_none() : m.orders_equipment_customer_first()}
					value={equipmentId}
					options={equipmentOptions}
					onchange={(value: string) => (equipmentId = value)}
				/>
				<SelectField
					field={fields.type}
					label={m.orders_field_type()}
					value={order?.type ?? "maintenance"}
					options={labelOptions("orderType", orderTypes)}
				/>
				<SelectField
					field={fields.priority}
					label={m.orders_field_priority()}
					value={order?.priority ?? "normal"}
					options={labelOptions("orderPriority", orderPriorities)}
				/>
				<TextField
					field={fields.description}
					label={m.orders_field_description()}
					value={order?.description}
					multiline
					class="md:col-span-2"
				/>
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.orders_form_planning()}</Card.Title>
			<Card.Description>{m.orders_form_planning_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				<SelectField
					field={fields.status}
					label={m.orders_field_status()}
					value={order?.status ?? "quote"}
					options={labelOptions("orderStatus", manualOrderStatuses)}
				/>
				<SelectField
					field={fields.engineerId}
					label={m.orders_field_engineer()}
					placeholder={m.common_unassigned()}
					value={order?.engineerId ? String(order.engineerId) : ""}
					options={engineerOptions}
				/>
				<div class="grid grid-cols-2 gap-4">
					<TextField
						field={fields.scheduledFor}
						label={m.orders_field_scheduled_for()}
						type="date"
						value={toDateInput(order?.scheduledFor)}
					/>
					<TextField
						field={fields.scheduledTime}
						label={m.orders_field_time()}
						type="time"
						value={order?.scheduledFor ? timeOfDay(order.scheduledFor) : ""}
					/>
				</div>
				<NumberField
					field={fields.laborHours}
					label={m.orders_field_labor()}
					value={order?.laborHours ?? 0}
					min={0}
					step={0.25}
				/>
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<OrderLinesField field={fields.lines} materials={options.materials} {order} />

	<!-- E.g. when the order was invoiced meanwhile, and can't be changed any more. -->
	<Field.FieldError errors={fields.issues()} />
	<FormActions
		pending={form.pending}
		submitLabel={order ? m.orders_save() : m.orders_create()}
		{cancelHref}
	/>
</form>
