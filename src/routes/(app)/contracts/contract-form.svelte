<!--
	@component
	The contract form, for creating (`createContract`) and editing (`updateContract`, with
	`contract`) a service contract.
-->
<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import { toast } from "svelte-sonner";

	import { levels } from "#lib/components/contracts/display.js";
	import EquipmentStatusBadge from "#lib/components/equipment/status-badge.svelte";
	import FormActions from "#lib/components/form/form-actions.svelte";
	import MoneyField from "#lib/components/form/money-field.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { label } from "#lib/i18n/labels.js";
	import { type ContractLevel, contractLevels, defaultResponseHours } from "#lib/models.js";
	import { toDateInput } from "#lib/schema.js";

	import type {
		createContract,
		getContract,
		getContractFormOptions,
		updateContract,
	} from "./contracts.remote.js";

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
	const uid = $props.id();

	// A new contract runs for a year from the first of next month.
	const today = new Date();
	const startsOn = $derived(
		contract?.startsOn ?? new Date(today.getFullYear(), today.getMonth() + 1, 1),
	);
	const endsOn = $derived(
		contract?.endsOn ?? new Date(today.getFullYear() + 1, today.getMonth() + 1, 0),
	);

	// Only the chosen customer's equipment can be covered.
	let customerId = $derived(contract ? String(contract.customerId) : "");
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
		if (await submit()) toast.success(contract ? "Contract saved" : "Contract created");
	})}
	class="flex flex-col gap-6"
>
	{#if contract}
		<!-- Only the edit form has an id field. -->
		<input {...(form as typeof updateContract).fields.id.as("hidden", String(contract.id))} />
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>Agreement</Card.Title>
			<Card.Description>Who it's for, the level of service, and what it costs.</Card.Description>
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
					onchange={changeCustomer}
				/>
				<SelectField
					field={fields.level}
					label="Level"
					value={level}
					options={contractLevels.map((value) => ({ value, label: levels[value].label }))}
					onchange={changeLevel}
				/>
				<TextField
					field={fields.startsOn}
					label="Starts on"
					type="date"
					value={toDateInput(startsOn)}
				/>
				<TextField
					field={fields.endsOn}
					label="Ends on"
					type="date"
					value={toDateInput(endsOn)}
					description="The last day the contract covers."
				/>
				<MoneyField field={fields.monthlyFee} label="Monthly fee" cents={contract?.monthlyFee} />
				<NumberField
					field={fields.responseHours}
					label="Response time (hours)"
					value={contract?.responseHours ?? defaultResponseHours.standard}
					min={1}
					step={1}
					description="How soon an engineer responds to a call-out."
				/>
				<TextField
					field={fields.notes}
					label="Notes"
					value={contract?.notes}
					multiline
					class="md:col-span-2"
				/>
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Covered equipment</Card.Title>
			<Card.Description>
				{customerId
					? "The customer's units that this contract covers."
					: "Choose a customer to see their equipment."}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldSet data-invalid={fields.equipmentIds.issues()?.length ? true : undefined}>
				<Field.FieldLegend class="sr-only">Covered equipment</Field.FieldLegend>
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
										{unit.serialNumber} · {label("equipmentCategory", unit.category)}
									</Field.FieldDescription>
								</Field.FieldContent>
								<EquipmentStatusBadge status={unit.status} />
							</Field.Field>
						{/each}
					</Field.FieldGroup>
				{:else}
					<p class="text-sm text-muted-foreground">
						{customerId ? "This customer has no equipment yet." : "No customer chosen yet."}
					</p>
				{/if}
				<Field.FieldError errors={fields.equipmentIds.issues()} />
			</Field.FieldSet>
		</Card.Content>
	</Card.Root>

	<FormActions
		pending={form.pending}
		submitLabel={contract ? "Save contract" : "Create contract"}
		{cancelHref}
	/>
</form>
