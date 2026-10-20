<!--
	The customer's orders in the portal, newest first: those still to be done (also not accepted
	yet), the done ones, or all of them (`?show=`); cards on a phone, a table on a wide screen.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";

	import FilterChips from "#lib/components/filter-chips.svelte";
	import { refreshOnChange } from "#lib/hooks/refresh-on-change.svelte.ts";
	import { isDoneOrder, type OrderStatus, pendingOrderStatuses } from "#lib/models.ts";
	import { isOneOf } from "#lib/one-of.ts";

	import { getPortalOrders, watchPortal } from "../client.remote.ts";
	import OrderList from "../order-list.svelte";

	const orders = $derived(await getPortalOrders());

	refreshOnChange(watchPortal, () => getPortalOrders().refresh());

	const tabs = {
		open: {
			label: m.client_orders_open,
			keep: (status: OrderStatus) => isOneOf(pendingOrderStatuses, status),
		},
		done: { label: m.client_orders_done, keep: isDoneOrder },
		all: { label: m.client_orders_all, keep: () => true },
	};
	type Tab = keyof typeof tabs;

	// The tab is in the URL (`?show=done`, none for the open ones), so back, forward and a reload
	// keep it.
	const tab = $derived.by((): Tab => {
		const show = page.url.searchParams.get("show");
		return show === "done" || show === "all" ? show : "open";
	});
	const here = resolve("/(customer)/portal/orders");
	const chips = $derived(
		(Object.keys(tabs) as Tab[]).map((key) => ({
			value: key,
			label: tabs[key].label(),
			count: orders.filter((order) => tabs[key].keep(order.status)).length,
			href: key === "open" ? here : `${here}?show=${key}`,
		})),
	);

	const shown = $derived(orders.filter((order) => tabs[tab].keep(order.status)));
</script>

<svelte:head>
	<title>{m.client_nav_orders()} · {m.client_title()}</title>
</svelte:head>

<h1 class="text-2xl font-semibold tracking-tight">{m.client_nav_orders()}</h1>

<FilterChips label={m.client_orders_show()} options={chips} value={tab} />

{#if shown.length}
	<OrderList orders={shown} />
{:else}
	<Empty.Root class="border">
		<Empty.Header>
			<Empty.Media variant="icon"><ClipboardListIcon /></Empty.Media>
			<Empty.Title>{m.client_no_orders()}</Empty.Title>
		</Empty.Header>
	</Empty.Root>
{/if}
