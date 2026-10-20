<!--
	@component
	Adds a maintenance plan to a unit, or edits one of its plans: its description, the type of order
	it makes, its interval and when its next visit is due.
-->
<script lang="ts">
	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { currentDay } from "#lib/dates.ts";
	import { labelOptions } from "#lib/i18n/index.ts";

	import { intervalLimits, planOrderTypes } from "../model.ts";
	import { createPlan, updatePlan } from "../plans.remote.ts";

	let {
		equipmentId,
		plan,
		open = $bindable(false),
	}: {
		/** The unit a new plan is for. */
		equipmentId: number;
		/** The plan to edit; a new one if not given. */
		plan?: {
			id: number;
			orderType: (typeof planOrderTypes)[number];
			description: string;
			intervalMonths: number;
			nextDueOn: Temporal.PlainDate;
		};
		open?: boolean;
	} = $props();

	const form = $derived(
		plan ? updatePlan.for(String(plan.id)) : createPlan.for(`unit-${equipmentId}`),
	);
	const typeOptions = $derived(labelOptions("orderType", planOrderTypes));
</script>

<FormDialog
	{form}
	title={plan ? m.maintenance_dialog_edit_title() : m.maintenance_dialog_new_title()}
	description={m.maintenance_dialog_description()}
	submitLabel={m.maintenance_save()}
	hidden={plan ? { id: String(plan.id) } : { equipmentId: String(equipmentId) }}
	done={m.maintenance_plan_saved()}
	class="sm:max-w-md"
	bind:open
>
	<Field.FieldGroup>
		<TextField
			field={form.fields.description}
			label={m.maintenance_field_description()}
			value={plan?.description}
		/>
		<SelectField
			field={form.fields.orderType}
			label={m.maintenance_field_order_type()}
			options={typeOptions}
			value={plan?.orderType ?? "maintenance"}
		/>
		<div class="grid grid-cols-2 gap-4">
			<NumberField
				field={form.fields.intervalMonths}
				label={m.maintenance_field_interval()}
				min={intervalLimits.min}
				max={intervalLimits.max}
				step={1}
				value={plan?.intervalMonths ?? 12}
			/>
			<TextField
				field={form.fields.nextDueOn}
				label={m.maintenance_field_next_due()}
				type="date"
				value={(plan?.nextDueOn ?? currentDay()).toString()}
			/>
		</div>
	</Field.FieldGroup>
</FormDialog>
