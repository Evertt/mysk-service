<!--
	A unit in the engineer portal, where its QR code leads an engineer (`/q/<token>`): what it is,
	where, and their open orders on it.
-->
<script lang="ts">
	import { StatusBadge } from "#lib/equipment/components.ts";
	import { unitLine, unitTitle } from "#lib/equipment/index.ts";

	import PlaceCard from "../../place-card.svelte";
	import { getMyUnit } from "../../places.remote.ts";
	import ScannedOrders from "../../scanned-orders.svelte";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getMyUnit(params.serial));
	const unit = $derived(data.unit);
</script>

<svelte:head>
	<title>{unit.serialNumber} · {m.portal_title()}</title>
</svelte:head>

<header class="flex flex-col gap-2">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-2xl font-semibold tracking-tight">{unitTitle(unit)}</h1>
		<StatusBadge status={unit.status} />
	</div>
	<p class="text-sm text-muted-foreground">
		{unitLine(unit, { category: unit.category })}
	</p>
</header>

<ScannedOrders orders={data.orders} />

<PlaceCard site={data.site} location={unit.location} />
