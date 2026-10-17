<!--
	The customer's orders in the portal, newest first: those still to be done (also not accepted
	yet), the done ones, or all of them; cards on a phone, a table on a wide screen.
-->
<script lang="ts">
	import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";

	import { formatNumber } from "#lib/i18n/index.ts";
	import { isDoneOrder, type OrderStatus, pendingOrderStatuses } from "#lib/models.ts";
	import { cn } from "#lib/utils.ts";

	import { getPortalOrders } from "../client.remote.ts";
	import { refreshOnChanges } from "../live.svelte.ts";
	import OrderList from "../order-list.svelte";

	const orders = $derived(await getPortalOrders());

	refreshOnChanges(() => getPortalOrders().refresh());

	const tabs: Record<string, { label: () => string; keep: (status: OrderStatus) => boolean }> = {
		open: {
			label: m.client_orders_open,
			keep: (status) => (pendingOrderStatuses as readonly OrderStatus[]).includes(status),
		},
		done: { label: m.client_orders_done, keep: isDoneOrder },
		all: { label: m.client_orders_all, keep: () => true },
	};
	let tab = $state("open");

	const shown = $derived(orders.filter((order) => tabs[tab].keep(order.status)));
</script>

<svelte:head>
	<title>{m.client_nav_orders()} · {m.client_title()}</title>
</svelte:head>

<h1 class="text-2xl font-semibold tracking-tight">{m.client_nav_orders()}</h1>

<div role="group" aria-label={m.client_orders_show()} class="flex flex-wrap gap-1">
	{#each Object.entries(tabs) as [key, entry] (key)}
		{@const count = orders.filter((order) => entry.keep(order.status)).length}
		<button
			type="button"
			aria-pressed={tab === key}
			onclick={() => (tab = key)}
			class={cn(
				"rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent",
				tab === key && "border-primary bg-accent font-medium",
			)}
		>
			{entry.label()} <span class="text-muted-foreground tabular-nums">{formatNumber(count)}</span>
		</button>
	{/each}
</div>

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
