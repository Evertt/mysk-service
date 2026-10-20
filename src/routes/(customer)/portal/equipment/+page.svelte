<!--
	The customer's equipment in the portal, read-only: each site the contact sees with its address,
	its locations (each a link to its units) and its units; side by side where there's room.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import MapPinIcon from "@lucide/svelte/icons/map-pin";

	import { siteAddressLine } from "#lib/customers/index.ts";
	import { UnitRow } from "#lib/equipment/components.ts";

	import { getPortalSites } from "../client.remote.ts";

	const sites = $derived(await getPortalSites());
</script>

<svelte:head>
	<title>{m.client_nav_equipment()} · {m.client_title()}</title>
</svelte:head>

<h1 class="text-2xl font-semibold tracking-tight">{m.client_nav_equipment()}</h1>

<div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,34rem),1fr))] items-start gap-6">
	{#each sites as site (site.id)}
		<Card.Root data-site={site.name}>
			<Card.Header>
				<Card.Title>{site.name}</Card.Title>
				<Card.Description class="flex items-center gap-1">
					<MapPinIcon class="size-3.5 shrink-0" />
					{siteAddressLine(site)}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				{#if site.locations.length}
					<ul class="flex flex-wrap gap-2" aria-label={m.client_locations()}>
						{#each site.locations as location (location.id)}
							<li>
								<a
									href={resolve("/(customer)/portal/locations/[id]", { id: String(location.id) })}
									class="block rounded-md border px-2.5 py-1 text-sm transition-colors hover:bg-accent"
									data-location={location.id}
								>
									{location.name}
								</a>
							</li>
						{/each}
					</ul>
				{/if}
				{#if site.units.length}
					<div class="flex flex-col divide-y">
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
					<p class="text-xs text-muted-foreground">
						{m.common_count_units({ count: site.units.length })}
					</p>
				{:else}
					<p class="text-sm text-muted-foreground">{m.client_site_no_units()}</p>
				{/if}
			</Card.Content>
		</Card.Root>
	{:else}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Title>{m.client_no_units()}</Empty.Title>
				<Empty.Description>{m.client_no_units_description()}</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{/each}
</div>
