<!--
	One of the customer's units in the portal, read-only: what it is and where, "report a breakdown"
	of it, what the tenant's modules add (`client.unit`, e.g. its inspection status) and its orders,
	its service history.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import SirenIcon from "@lucide/svelte/icons/siren";

	import { unit as unitParts } from "#lib/client/extensions.ts";
	import { StatusBadge } from "#lib/equipment/components.ts";
	import { unitTitle } from "#lib/equipment/index.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";

	import { getPortalUnit } from "../../client.remote.ts";
	import { refreshOnChanges } from "../../live.svelte.ts";
	import OrderCard from "../../order-card.svelte";
	import { unitDetails } from "../../units.ts";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getPortalUnit(params.serial));
	const unit = $derived(data.unit);

	refreshOnChanges(() => getPortalUnit(params.serial).refresh());
</script>

<svelte:head>
	<title>{unitTitle(unit)} · {m.client_title()}</title>
</svelte:head>

<header class="flex flex-col gap-2">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-2xl font-semibold tracking-tight">{unitTitle(unit)}</h1>
		<StatusBadge status={unit.status} />
	</div>
	<p class="text-sm text-muted-foreground">
		{unitDetails(unit, unit.category, unit.site, unit.location)}
	</p>
</header>

<div>
	<Button
		href={`${resolve("/(customer)/portal/report")}?unit=${encodeURIComponent(unit.serialNumber)}`}
	>
		<SirenIcon data-icon="inline-start" />
		{m.client_report_this()}
	</Button>
</div>

<ExtensionSlot point={unitParts} props={{ serialNumber: unit.serialNumber }} />

<section class="flex flex-col gap-3" aria-label={m.client_unit_history()}>
	<h2 class="text-sm font-medium text-muted-foreground">{m.client_unit_history()}</h2>
	{#each data.orders as order (order.id)}
		<OrderCard {order} />
	{:else}
		<p class="text-sm text-muted-foreground">{m.client_unit_no_orders()}</p>
	{/each}
</section>
