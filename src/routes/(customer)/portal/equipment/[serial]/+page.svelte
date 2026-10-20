<!--
	One of the customer's units in the portal, read-only: what it is and where, "report a breakdown"
	of it, what the tenant's modules add (`client.unit`, e.g. its inspection status) and its orders,
	its service history.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import SirenIcon from "@lucide/svelte/icons/siren";

	import { unit as unitParts } from "#lib/client/extensions.ts";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { unitLine, unitTitle, equipmentStatusDisplay } from "#lib/equipment/index.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { refreshOnChange } from "#lib/hooks/refresh-on-change.svelte.ts";

	import { getPortalUnit, watchPortal } from "../../client.remote.ts";
	import OrderList from "../../order-list.svelte";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getPortalUnit(params.serial));
	const unit = $derived(data.unit);

	refreshOnChange(watchPortal, () => getPortalUnit(params.serial).refresh());
</script>

<svelte:head>
	<title>{unitTitle(unit)} · {m.client_title()}</title>
</svelte:head>

<header class="flex flex-col gap-2">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-2xl font-semibold tracking-tight">{unitTitle(unit)}</h1>
		<EnumBadge display={equipmentStatusDisplay} value={unit.status} />
	</div>
	<p class="text-sm text-muted-foreground">
		{unitLine(unit, { category: unit.category, site: unit.site.name, location: unit.location })}
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

<ExtensionSlot
	point={unitParts}
	props={{ serialNumber: unit.serialNumber }}
	class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,28rem),1fr))] items-start gap-6"
/>

<section class="flex flex-col gap-3" aria-label={m.client_unit_history()}>
	<h2 class="text-sm font-medium text-muted-foreground">{m.client_unit_history()}</h2>
	{#if data.orders.length}
		<OrderList orders={data.orders} />
	{:else}
		<p class="text-sm text-muted-foreground">{m.client_unit_no_orders()}</p>
	{/if}
</section>
