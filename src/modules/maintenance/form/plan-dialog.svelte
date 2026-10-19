<!--
	@component
	Adds a maintenance plan to a unit, or edits one of its plans: its description, the type of order
	it makes, its interval and when its next visit is due.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import NumberField from "#lib/components/form/number-field.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import TextField from "#lib/components/form/text-field.svelte";
	import { getTimeZone } from "#lib/dates.ts";
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

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>
				{plan ? m.maintenance_dialog_edit_title() : m.maintenance_dialog_new_title()}
			</Dialog.Title>
			<Dialog.Description>{m.maintenance_dialog_description()}</Dialog.Description>
		</Dialog.Header>
		<form
			{...form.enhance(async ({ submit }) => {
				if (!(await submitted(submit))) return;
				open = false;
				toast.success(m.maintenance_plan_saved());
			})}
			class="flex flex-col gap-6"
		>
			{#if plan}
				<input {...updatePlan.for(String(plan.id)).fields.id.as("hidden", String(plan.id))} />
			{:else}
				<input
					{...createPlan
						.for(`unit-${equipmentId}`)
						.fields.equipmentId.as("hidden", String(equipmentId))}
				/>
			{/if}
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
						value={(plan?.nextDueOn ?? Temporal.Now.plainDateISO(getTimeZone())).toString()}
					/>
				</div>
			</Field.FieldGroup>
			<!-- E.g. when the plan was deleted in the meantime. -->
			<Field.FieldError errors={form.fields.issues()} />
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="ghost">{m.common_cancel()}</Button>
					{/snippet}
				</Dialog.Close>
				<SubmitButton pending={form.pending}>{m.maintenance_save()}</SubmitButton>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
