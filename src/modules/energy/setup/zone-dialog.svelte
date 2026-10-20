<!--
	@component
	Adds a zone to a site, or edits one (`zone`): its code (what the gateway names it by, unique in
	the site), name, floor and area.
-->
<script lang="ts">
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import { saveEnergyZone } from "./setup.remote.ts";

	let {
		siteId,
		zone,
	}: {
		siteId: number;
		/** The zone to edit; a new one without. */
		zone?: { id: number; code: string; name: string; floor: string | null; areaM2: number };
	} = $props();

	const form = $derived(saveEnergyZone.for(zone ? String(zone.id) : "new"));
</script>

<FormDialog
	{form}
	title={zone ? m.energy_setup_zone_edit({ code: zone.code }) : m.energy_setup_zone_add()}
	description={m.energy_setup_zone_description()}
	hidden={{ energySiteId: String(siteId), zoneId: zone && String(zone.id) }}
	done={(result) => m.energy_setup_saved({ name: result?.code ?? "" })}
	class="sm:max-w-lg"
>
	{#snippet trigger(props)}
		{#if zone}
			<Button
				{...props}
				variant="ghost"
				size="icon-sm"
				aria-label={m.energy_setup_zone_edit({ code: zone.code })}
			>
				<PencilIcon />
			</Button>
		{:else}
			<Button {...props} variant="outline" size="sm">
				<PlusIcon data-icon="inline-start" />
				{m.energy_setup_zone_add()}
			</Button>
		{/if}
	{/snippet}
	<Field.FieldGroup>
		<div class="grid gap-4 sm:grid-cols-[10rem_1fr]">
			<TextField
				field={form.fields.code}
				label={m.energy_setup_code()}
				value={zone?.code}
				placeholder="Z-A"
			/>
			<TextField field={form.fields.name} label={m.energy_setup_name()} value={zone?.name} />
		</div>
		<div class="grid gap-4 sm:grid-cols-2">
			<TextField
				field={form.fields.floor}
				label={m.energy_setup_floor()}
				value={zone?.floor}
				description={m.energy_setup_floor_hint()}
			/>
			<NumberField
				field={form.fields.areaM2}
				label={m.energy_setup_area()}
				value={zone?.areaM2}
				min={0}
				step={1}
			/>
		</div>
	</Field.FieldGroup>
</FormDialog>
