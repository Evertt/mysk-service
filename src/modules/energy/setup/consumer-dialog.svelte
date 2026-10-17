<!--
	@component
	Adds a consumer to one of a site's zones, or edits one (`consumer`): what uses the power, its
	rated power, and the unit it is, if it's one of the site's.
-->
<script lang="ts">
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";

	import NumberField from "#lib/components/form/number-field.svelte";
	import SelectField, { type SelectOption } from "#lib/components/form/select-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import { saveEnergyConsumer } from "./setup.remote.ts";

	let {
		siteId,
		zones,
		units,
		consumer,
	}: {
		siteId: number;
		zones: SelectOption[];
		units: SelectOption[];
		/** The consumer to edit; a new one without. */
		consumer?: {
			id: number;
			zoneId: number;
			name: string;
			ratedKw: number;
			equipmentId: number | null;
		};
	} = $props();

	let open = $state(false);
	const form = $derived(saveEnergyConsumer.for(consumer ? String(consumer.id) : "new"));
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			{#if consumer}
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					aria-label={m.energy_setup_consumer_edit({ name: consumer.name })}
				>
					<PencilIcon />
				</Button>
			{:else}
				<Button {...props} variant="outline" size="sm" disabled={!zones.length}>
					<PlusIcon data-icon="inline-start" />
					{m.energy_setup_consumer_add()}
				</Button>
			{/if}
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>
				{consumer
					? m.energy_setup_consumer_edit({ name: consumer.name })
					: m.energy_setup_consumer_add()}
			</Dialog.Title>
			<Dialog.Description>{m.energy_setup_consumer_description()}</Dialog.Description>
		</Dialog.Header>
		<form
			{...form.enhance(async ({ submit }) => {
				if (await submit()) {
					open = false;
					toast.success(m.energy_setup_saved({ name: form.result?.name ?? "" }));
				}
			})}
			class="flex flex-col gap-6"
		>
			<input {...form.fields.energySiteId.as("hidden", String(siteId))} />
			{#if consumer}
				<input {...form.fields.consumerId.as("hidden", String(consumer.id))} />
			{/if}
			<Field.FieldGroup>
				<SelectField
					field={form.fields.zoneId}
					label={m.energy_setup_zone()}
					options={zones}
					value={consumer ? String(consumer.zoneId) : zones[0]?.value}
				/>
				<div class="grid gap-4 sm:grid-cols-[1fr_10rem]">
					<TextField
						field={form.fields.name}
						label={m.energy_setup_name()}
						value={consumer?.name}
					/>
					<NumberField
						field={form.fields.ratedKw}
						label={m.energy_setup_rated()}
						value={consumer?.ratedKw}
						min={0}
						step="any"
					/>
				</div>
				<SelectField
					field={form.fields.equipmentId}
					label={m.energy_setup_unit()}
					options={units}
					placeholder={m.energy_setup_no_unit()}
					value={consumer?.equipmentId ? String(consumer.equipmentId) : ""}
					description={m.energy_setup_unit_hint()}
				/>
			</Field.FieldGroup>
			<Field.FieldError errors={form.fields.issues()} />
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="ghost">{m.common_cancel()}</Button>
					{/snippet}
				</Dialog.Close>
				<SubmitButton pending={form.pending}>{m.common_save()}</SubmitButton>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
