<!--
	One of the customer's units' service history in the portal: its orders, newest first, linked from
	its page (back to it from the app bar).
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import AppBar from "#lib/client/app-bar.svelte";
	import { refreshOnRecordChange } from "#lib/components/activity/change-feed.svelte.ts";
	import { refreshOnActivity } from "#lib/components/activity/live-activity.svelte.ts";
	import { unitTitle } from "#lib/equipment/index.ts";

	import { getPortalUnit, getPortalUnitHistory } from "../../../client.remote.ts";
	import OrderList from "../../../order-list.svelte";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const [unit, orders] = $derived(
		await Promise.all([getPortalUnit(params.serial), getPortalUnitHistory(params.serial)]),
	);

	// Live: the unit, and the orders at it.
	refreshOnRecordChange(
		() => ({ type: "equipment", id: unit.id }),
		() => getPortalUnit(params.serial).refresh(),
	);
	refreshOnActivity(() => getPortalUnitHistory(params.serial).refresh(), { types: ["order"] });
</script>

<AppBar
	title={m.client_unit_history_link()}
	subtitle={unitTitle(unit)}
	back={{
		href: resolve("/(customer)/portal/equipment/[serial]", { serial: unit.serialNumber }),
		label: unitTitle(unit),
	}}
/>

<section class="flex flex-col gap-2" aria-label={m.client_unit_history()}>
	{#if orders.length}
		<OrderList {orders} />
	{:else}
		<p class="px-1 text-[0.9375rem] text-muted-foreground">{m.client_unit_no_orders()}</p>
	{/if}
</section>
