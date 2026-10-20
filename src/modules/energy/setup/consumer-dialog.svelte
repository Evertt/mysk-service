<!--
	@component
	Adds a consumer to one of a site's zones, or edits one (`consumer`): what uses the power, its
	rated power, and the unit it is, if it's one of the site's.
-->
<script lang="ts">
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import SelectField, { type SelectOption } from "#lib/components/form/select-field.svelte";
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

	const form = $derived(saveEnergyConsumer.for(consumer ? String(consumer.id) : "new"));
</script>

<FormDialog
	{form}
	title={consumer
		? m.energy_setup_consumer_edit({ name: consumer.name })
		: m.energy_setup_consumer_add()}
	description={m.energy_setup_consumer_description()}
	hidden={{ energySiteId: String(siteId), consumerId: consumer && String(consumer.id) }}
	done={(result) => m.energy_setup_saved({ name: result?.name ?? "" })}
	class="sm:max-w-lg"
>
	{#snippet trigger(props)}
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
	<Field.FieldGroup>
		<SelectField
			field={form.fields.zoneId}
			label={m.energy_setup_zone()}
			options={zones}
			value={consumer ? String(consumer.zoneId) : zones[0]?.value}
		/>
		<div class="grid gap-4 sm:grid-cols-[1fr_10rem]">
			<TextField field={form.fields.name} label={m.energy_setup_name()} value={consumer?.name} />
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
</FormDialog>
