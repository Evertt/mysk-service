<!--
	A location in the engineer portal, where its QR code leads an engineer (`/q/<token>`): where it
	is, its units, and the engineer's open orders on them.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { unitLine, unitTitle, equipmentStatusDisplay } from "#lib/equipment/index.ts";

	import PlaceCard from "../../place-card.svelte";
	import { getMyLocation } from "../../places.remote.ts";
	import ScannedOrders from "../../scanned-orders.svelte";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getMyLocation(params.id));
</script>

<svelte:head>
	<title>{data.location.name} · {m.portal_title()}</title>
</svelte:head>

<header class="flex flex-col gap-1">
	<h1 class="text-2xl font-semibold tracking-tight">{data.location.name}</h1>
	{#if data.location.description}
		<p class="text-sm text-muted-foreground">{data.location.description}</p>
	{/if}
</header>

<ScannedOrders orders={data.orders} />

<Card.Root>
	<Card.Header>
		<Card.Title>{m.portal_equipment()}</Card.Title>
		<Card.Description>{m.common_count_units({ count: data.units.length })}</Card.Description>
	</Card.Header>
	<Card.Content>
		<ul class="flex flex-col divide-y">
			{#each data.units as unit (unit.id)}
				<li class="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
					<a
						href={resolve("/(field)/my/equipment/[serial]", { serial: unit.serialNumber })}
						class="flex min-w-0 flex-col"
					>
						<span class="truncate font-medium">{unitTitle(unit)}</span>
						<span class="text-xs text-muted-foreground">{unitLine(unit)}</span>
					</a>
					<EnumBadge display={equipmentStatusDisplay} value={unit.status} />
				</li>
			{:else}
				<li class="text-sm text-muted-foreground">{m.equipment_location_units_empty()}</li>
			{/each}
		</ul>
	</Card.Content>
</Card.Root>

<PlaceCard site={data.site} />
