<!--
	One of the customer's locations in the portal, read-only: where it is (under the app bar's title),
	"report a breakdown" of one of its units, and its units, each a row to its page.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import SirenIcon from "@lucide/svelte/icons/siren";

	import AppBar from "#lib/client/app-bar.svelte";
	import { UnitRow } from "#lib/equipment/components.ts";

	import { getPortalLocation } from "../../client.remote.ts";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getPortalLocation(params.id));
	const location = $derived(data.location);
</script>

<AppBar
	title={location.name}
	subtitle={[location.site.name, location.description].filter(Boolean).join(" · ")}
	back={{ href: resolve("/(customer)/portal/equipment"), label: m.client_tab_equipment() }}
/>

{#if data.units.length}
	<Button
		href={`${resolve("/(customer)/portal/report")}?location=${location.id}`}
		class="primary-action"
	>
		<SirenIcon data-icon="inline-start" />
		{m.client_report_here()}
	</Button>
	<div class="flex flex-col divide-y rounded-xl border bg-card px-4">
		{#each data.units as unit (unit.id)}
			<UnitRow
				{unit}
				href={resolve("/(customer)/portal/equipment/[serial]", { serial: unit.serialNumber })}
				extras={{ category: unit.category }}
			/>
		{/each}
	</div>
{:else}
	<p class="px-1 text-[0.9375rem] text-muted-foreground">{m.client_location_no_units()}</p>
{/if}
