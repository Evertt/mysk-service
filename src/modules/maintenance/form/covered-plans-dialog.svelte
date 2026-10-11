<!--
	@component
	The contract card's bulk add: a plan (description, order type, interval) for each of the
	contract's covered units without one, first due one interval from today.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import NumberField from "#lib/components/form/number-field.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { labelOptions } from "#lib/i18n/index.ts";
	import { errorMessage } from "#lib/utils.ts";

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

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{m.maintenance_contract_add()}</Dialog.Title>
			<Dialog.Description>{m.maintenance_contract_add_description()}</Dialog.Description>
		</Dialog.Header>
		<form
			{...form.enhance(async ({ submit }) => {
				try {
					if (!(await submit())) return;
				} catch (error) {
					toast.error(errorMessage(error, m.common_error_generic()));
					return;
				}
				open = false;
				toast.success(m.maintenance_contract_added({ count: form.result?.added ?? 0 }));
			})}
			class="flex flex-col gap-6"
		>
			<input {...form.fields.equipmentIds.as("hidden", equipmentIds.join(","))} />
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
			<Field.FieldError errors={form.fields.issues()} />
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="ghost">{m.common_cancel()}</Button>
					{/snippet}
				</Dialog.Close>
				<SubmitButton pending={form.pending}>{m.maintenance_add()}</SubmitButton>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
