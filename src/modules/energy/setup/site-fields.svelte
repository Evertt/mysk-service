<!--
	@component
	An energy site's fields, shared by the dialog that adds one and its setup page: its name and its
	main connection's, the contract (peak kW, kWh a year), the solar panels, the tariff, the CO₂
	factor and the time zone its days are counted in. A new site starts with the module's defaults.
-->
<script lang="ts">
	import type { RemoteFormField } from "$app/server";

	import NumberField from "#lib/components/form/number-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import { DEFAULT_CO2_FACTOR, DEFAULT_TARIFF } from "../model.ts";

	let {
		fields,
		site,
		defaultName,
	}: {
		fields: {
			name: RemoteFormField<string>;
			meterName: RemoteFormField<string>;
			contractedPeakKw: RemoteFormField<number>;
			contractedKwhPerYear: RemoteFormField<number>;
			pvCapacityKw: RemoteFormField<number>;
			tariff: RemoteFormField<number>;
			co2Factor: RemoteFormField<number>;
			timeZone: RemoteFormField<string>;
		};
		/** The site as it's set up; a new one's defaults without. */
		site?: {
			name: string;
			meterName: string;
			contractedPeakKw: number;
			contractedKwhPerYear: number;
			pvCapacityKw: number;
			tariff: number;
			co2Factor: number;
			timeZone: string;
		};
		/** What a new site is called if its name is left empty. */
		defaultName?: string;
	} = $props();
</script>

<div class="grid gap-4 sm:grid-cols-2">
	<TextField
		field={fields.name}
		label={m.energy_setup_name()}
		value={site?.name}
		placeholder={defaultName}
		description={site ? undefined : m.energy_setup_name_hint()}
	/>
	<TextField
		field={fields.meterName}
		label={m.energy_setup_meter()}
		value={site?.meterName}
		placeholder={site ? undefined : m.energy_setup_default_meter()}
	/>
	<NumberField
		field={fields.contractedPeakKw}
		label={m.energy_setup_peak()}
		value={site?.contractedPeakKw}
		min={0}
		step="any"
	/>
	<NumberField
		field={fields.contractedKwhPerYear}
		label={m.energy_setup_kwh_year()}
		value={site?.contractedKwhPerYear}
		min={0}
		step={1}
	/>
	<NumberField
		field={fields.pvCapacityKw}
		label={m.energy_setup_pv()}
		value={site?.pvCapacityKw ?? 0}
		min={0}
		step="any"
	/>
	<NumberField
		field={fields.tariff}
		label={m.energy_setup_tariff()}
		value={site?.tariff ?? DEFAULT_TARIFF}
		min={0}
		step="any"
	/>
	<NumberField
		field={fields.co2Factor}
		label={m.energy_setup_co2()}
		value={site?.co2Factor ?? DEFAULT_CO2_FACTOR}
		min={0}
		step="any"
	/>
	<TextField
		field={fields.timeZone}
		label={m.energy_setup_time_zone()}
		value={site?.timeZone ?? "Europe/Amsterdam"}
		description={m.energy_setup_time_zone_hint()}
	/>
</div>
