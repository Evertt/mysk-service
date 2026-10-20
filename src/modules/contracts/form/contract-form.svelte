<!--
	@component
	The contract form, for creating (`createContract`) and editing (`updateContract`, with
	`contract`) a service contract.
-->
<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import { toast } from "svelte-sonner";

	import EnumBadge from "#lib/components/enum-badge.svelte";
	import FormActions from "#lib/components/form/form-actions.svelte";
	import { formSnapshot } from "#lib/components/form/form-snapshot.ts";
	import MoneyField from "#lib/components/form/money-field.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import TextField from "#lib/components/form/text-field.svelte";
	import { currentDay } from "#lib/dates.ts";
	import { equipmentStatusDisplay } from "#lib/equipment/index.ts";

	import type {
		createContract,
		getContract,
		getContractFormOptions,
		updateContract,
	} from "../contracts.remote.ts";
	import { contractLevelDisplay } from "../display.ts";
	import { type ContractLevel, contractLevels, defaultResponseHours } from "../model.ts";

	type Options = Awaited<ReturnType<typeof getContractFormOptions>>;
	type Contract = Awaited<ReturnType<typeof getContract>>["contract"];

	let {
		form,
		options,
		contract,
		cancelHref,
	}: {
		form: typeof createContract | typeof updateContract;
		options: Options;
		contract?: Contract;
		cancelHref: string;
	} = $props();

	const fields = $derived(form.fields);
	// What's typed and not saved yet comes back with the page (back button, reload).
	formSnapshot("contract", () => form);
	const uid = $props.id();

	// A new contract runs for a year from the first of next month.
	const nextMonth = currentDay().with({ day: 1 }).add({ months: 1 });
	const startsOn = $derived(contract?.startsOn ?? nextMonth);
	const endsOn = $derived(contract?.endsOn ?? nextMonth.add({ years: 1 }).subtract({ days: 1 }));

	// Only the chosen customer's equipment can be covered (also when the snapshot brings one back).
	let customerId = $derived(
		fields.customerId.value() ?? (contract ? String(contract.customerId) : ""),
	);
	const units = $derived(
		options.equipments.filter((unit) => String(unit.customerId) === customerId),
	);
	const covered = $derived(new Set(contract?.equipment.map((unit) => unit.id)));

	function changeCustomer(value: string) {
		customerId = value;
		fields.equipmentIds.set([]);
	}

	// A new level suggests its default response time, unless a custom one was entered.
	let level = $derived<ContractLevel>(contract?.level ?? "standard");
	function changeLevel(value: string) {
		const next = value as ContractLevel;
		const hours = fields.responseHours.value() ?? contract?.responseHours;
		if (hours === undefined || hours === defaultResponseHours[level]) {
			fields.responseHours.set(defaultResponseHours[next]);
		}
		level = next;
	}
</script>

<form
	{...form.enhance(async ({ submit }) => {
		// On success the server redirects to the contract; otherwise the fields show what's wrong.
		if (await submitted(submit))
			toast.success(contract ? m.contracts_saved() : m.contracts_created_toast());
	})}
	class="flex flex-col gap-6"
>
	{#if contract}
		<!-- Only the edit form has an id field. -->
		<input {...(form as typeof updateContract).fields.id.as("hidden", String(contract.id))} />
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.contracts_form_agreement()}</Card.Title>
			<Card.Description>{m.contracts_form_agreement_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				<SelectField
					field={fields.customerId}
					label={m.contracts_customer()}
					placeholder={m.contracts_customer_required()}
					value={customerId}
					options={options.customers.map((c) => ({
						value: String(c.id),
						label: `${c.name} (${c.code})`,
					}))}
					onchange={changeCustomer}
				/>
				<SelectField
					field={fields.level}
					label={m.contracts_level()}
					value={level}
					options={contractLevels.map((value) => ({
						value,
						label: contractLevelDisplay[value].label,
					}))}
					onchange={changeLevel}
				/>
				<TextField
					field={fields.startsOn}
					label={m.contracts_starts_on()}
					type="date"
					value={startsOn.toString()}
				/>
				<TextField
					field={fields.endsOn}
					label={m.contracts_ends_on()}
					type="date"
					value={endsOn.toString()}
					description={m.contracts_form_ends_description()}
				/>
				<MoneyField
					field={fields.monthlyFee}
					label={m.contracts_monthly_fee()}
					cents={contract?.monthlyFee}
				/>
				<NumberField
					field={fields.responseHours}
					label={m.contracts_form_response_hours()}
					value={contract?.responseHours ?? defaultResponseHours.standard}
					min={1}
					step={1}
					description={m.contracts_form_response_description()}
				/>
				<TextField
					field={fields.notes}
					label={m.contracts_notes()}
					value={contract?.notes}
					multiline
					class="md:col-span-2"
				/>
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.contracts_form_covered()}</Card.Title>
			<Card.Description>
				{customerId ? m.contracts_form_covered_description() : m.contracts_form_choose_customer()}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldSet data-invalid={fields.equipmentIds.issues()?.length ? true : undefined}>
				<Field.FieldLegend class="sr-only">{m.contracts_form_covered()}</Field.FieldLegend>
				{#if units.length}
					<Field.FieldGroup class="gap-0 divide-y rounded-lg border">
						{#each units as unit (unit.id)}
							{@const id = `${uid}-unit-${unit.id}`}
							<Field.Field orientation="horizontal" class="items-center px-4 py-3">
								<span class="relative flex size-4 shrink-0">
									<input
										{id}
										class="peer size-4 shrink-0 appearance-none rounded-[4px] border border-input shadow-xs transition-shadow outline-none checked:border-primary checked:bg-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:checked:bg-primary"
										{...fields.equipmentIds.as("checkbox", String(unit.id), covered.has(unit.id))}
									/>
									<CheckIcon
										class="pointer-events-none invisible absolute inset-0 m-auto size-3.5 text-primary-foreground peer-checked:visible"
									/>
								</span>
								<Field.FieldContent>
									<Field.FieldLabel for={id}>{unit.manufacturer} {unit.model}</Field.FieldLabel>
									<Field.FieldDescription>
										{unit.serialNumber} · {unit.category}
									</Field.FieldDescription>
								</Field.FieldContent>
								<EnumBadge display={equipmentStatusDisplay} value={unit.status} />
							</Field.Field>
						{/each}
					</Field.FieldGroup>
				{:else}
					<p class="text-sm text-muted-foreground">
						{customerId ? m.contracts_form_no_equipment() : m.contracts_form_no_customer()}
					</p>
				{/if}
				<Field.FieldError errors={fields.equipmentIds.issues()} />
			</Field.FieldSet>
		</Card.Content>
	</Card.Root>

	<FormActions
		pending={form.pending}
		submitLabel={contract ? m.contracts_form_save() : m.contracts_form_create()}
		{cancelHref}
	/>
</form>
