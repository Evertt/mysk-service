<!--
	The customer's equipment in the portal, the Equipment tab, read-only: each site the contact sees
	with its address, its locations (each a row to its units) and its units (each a row to its page),
	one site under the other.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import MapPinIcon from "@lucide/svelte/icons/map-pin";

	import AppBar from "#lib/client/app-bar.svelte";
	import { siteAddressLine } from "#lib/customers/index.ts";
	import { UnitRow } from "#lib/equipment/components.ts";

	import { getPortalSites } from "../client.remote.ts";

	const sites = $derived(await getPortalSites());
</script>

<AppBar title={m.client_tab_equipment()} />

{#each sites as site (site.id)}
	<section class="flex flex-col gap-2" aria-label={site.name} data-site={site.name}>
		<header class="flex flex-col gap-0.5 px-1">
			<h2 class="text-[1.0625rem] font-semibold">{site.name}</h2>
			<p class="flex items-center gap-1 text-sm text-muted-foreground">
				<MapPinIcon class="size-3.5 shrink-0" aria-hidden="true" />
				{siteAddressLine(site)}
			</p>
		</header>
		{#if site.locations.length}
			<ul
				class="divide-y overflow-hidden rounded-xl border bg-card"
				aria-label={m.client_locations()}
			>
				{#each site.locations as location (location.id)}
					<li>
						<a
							href={resolve("/(customer)/portal/locations/[id]", { id: String(location.id) })}
							class="flex min-h-12 items-center gap-3 px-4 py-2.5 text-[0.9375rem] transition-colors hover:bg-muted/60 active:bg-muted"
							data-location={location.id}
						>
							<MapPinIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
							<span class="min-w-0 flex-1 truncate font-medium">{location.name}</span>
							<ChevronRightIcon class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
						</a>
					</li>
				{/each}
			</ul>
		{/if}
		{#if site.units.length}
			<div class="flex flex-col divide-y rounded-xl border bg-card px-4">
				{#each site.units as unit (unit.id)}
					<UnitRow
						{unit}
						href={resolve("/(customer)/portal/equipment/[serial]", {
							serial: unit.serialNumber,
						})}
						extras={{ category: unit.category, location: unit.location }}
					/>
				{/each}
			</div>
			<p class="px-1 text-sm text-muted-foreground">
				{m.common_count_units({ count: site.units.length })}
			</p>
		{:else}
			<p class="px-1 text-[0.9375rem] text-muted-foreground">{m.client_site_no_units()}</p>
		{/if}
	</section>
{:else}
	<Empty.Root class="rounded-xl border bg-card">
		<Empty.Header>
			<Empty.Title>{m.client_no_units()}</Empty.Title>
			<Empty.Description>{m.client_no_units_description()}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{/each}
