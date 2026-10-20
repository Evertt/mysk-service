<!--
	@component
	The contract card's bulk add: a plan (description, order type, interval) for each of the
	contract's covered units without one, first due one interval from today.
-->
<script lang="ts">
	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { labelOptions } from "#lib/i18n/index.ts";

	import { intervalLimits, planOrderTypes } from "../model.ts";
	import { addCoveredPlans } from "../plans.remote.ts";

	let {
		contract,
		equipmentIds,
		open = $bindable(false),
	}: {
		/** The contract's number, to tell its form apart. */
		contract: string;
		/** The covered units' ids, sorted. */
		equipmentIds: number[];
		open?: boolean;
	} = $props();

	const form = $derived(addCoveredPlans.for(contract));
	const typeOptions = $derived(labelOptions("orderType", planOrderTypes));
</script>

<FormDialog
	{form}
	title={m.maintenance_contract_add()}
	description={m.maintenance_contract_add_description()}
	submitLabel={m.maintenance_add()}
	hidden={{ equipmentIds: equipmentIds.join(",") }}
	done={(result) => m.maintenance_contract_added({ count: result?.added ?? 0 })}
	class="sm:max-w-md"
	bind:open
>
	<Field.FieldGroup>
		<TextField field={form.fields.description} label={m.maintenance_field_description()} />
		<div class="grid grid-cols-2 gap-4">
			<SelectField
				field={form.fields.orderType}
				label={m.maintenance_field_order_type()}
				options={typeOptions}
				value="maintenance"
			/>
			<NumberField
				field={form.fields.intervalMonths}
				label={m.maintenance_field_interval()}
				min={intervalLimits.min}
				max={intervalLimits.max}
				step={1}
				value={12}
			/>
		</div>
	</Field.FieldGroup>
</FormDialog>
