<!--
	One of the customer's units' service history in the portal: its orders, newest first, linked from
	its page (back to it from the top).
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";

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

<svelte:head>
	<title>{m.client_unit_history_link()} · {unitTitle(unit)} · {m.client_title()}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	<header class="flex flex-col gap-1">
		<a
			href={resolve("/(customer)/portal/equipment/[serial]", { serial: unit.serialNumber })}
			class="inline-flex max-w-full items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
			data-unit-back
		>
			<ChevronLeftIcon class="size-4 shrink-0" aria-hidden="true" />
			<span class="truncate">{unitTitle(unit)}</span>
		</a>
		<h1 class="text-2xl font-semibold tracking-tight">{m.client_unit_history_link()}</h1>
	</header>

	<section class="flex flex-col gap-3" aria-label={m.client_unit_history()}>
		{#if orders.length}
			<OrderList {orders} />
		{:else}
			<p class="text-sm text-muted-foreground">{m.client_unit_no_orders()}</p>
		{/if}
	</section>
</div>
