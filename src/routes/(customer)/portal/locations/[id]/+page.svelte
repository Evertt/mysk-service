<!--
	One of the customer's locations in the portal, read-only: where it is, its units, and "report a
	breakdown" of one of them.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import SirenIcon from "@lucide/svelte/icons/siren";

	import { getPortalLocation } from "../../client.remote.ts";
	import UnitRow from "../../unit-row.svelte";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getPortalLocation(params.id));
	const location = $derived(data.location);
</script>

<svelte:head>
	<title>{location.name} · {m.client_title()}</title>
</svelte:head>

<header class="flex flex-col gap-1">
	<h1 class="text-2xl font-semibold tracking-tight">{location.name}</h1>
	<p class="text-sm text-muted-foreground">
		{[location.site, location.description].filter(Boolean).join(" · ")}
	</p>
</header>

{#if data.units.length}
	<div>
		<Button href={`${resolve("/(customer)/portal/report")}?location=${location.id}`}>
			<SirenIcon data-icon="inline-start" />
			{m.client_report_here()}
		</Button>
	</div>
	<Card.Root class="py-0">
		<div class="flex flex-col divide-y">
			{#each data.units as unit (unit.id)}
				<UnitRow {unit} showLocation={false} />
			{/each}
		</div>
	</Card.Root>
{:else}
	<p class="text-sm text-muted-foreground">{m.client_location_no_units()}</p>
{/if}
