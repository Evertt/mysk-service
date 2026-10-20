<script lang="ts">
	import { resolve } from "$app/paths";

	import EnumBadge from "#lib/components/enum-badge.svelte";
	import RecordPage from "#lib/components/record-page.svelte";
	import { CustomerCard, SiteCard } from "#lib/customers/components.ts";
	import {
		AcceptanceCard,
		EngineerCard,
		EquipmentHistoryCard,
		OrderLinesCard,
		OrderTags,
		ScheduleCard,
		TypeLabel,
		UnitsCard,
		WorkReport,
	} from "#lib/orders/components.ts";
	import { points } from "#lib/orders/extensions.ts";
	import {
		mayDeleteOrder,
		mayEditOrder,
		orderPriorityDisplay,
		orderStatusDisplay,
	} from "#lib/orders/index.ts";
	import { deleteOrder, getOrder, getOrderHistory } from "#lib/orders/remotes.ts";

	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getOrder(params.number));
	const order = $derived(data.order);
</script>

<!-- An invoiced order stays as it was invoiced; one awaiting acceptance is accepted first. -->
<RecordPage
	title={order.number}
	subtitle={order.description}
	list={{ label: m.orders_title(), href: resolve("/(app)/orders") }}
	edit={mayEditOrder(order.status)
		? resolve("/(app)/orders/[number]/edit", { number: order.number })
		: undefined}
	remove={mayDeleteOrder(order.status)
		? {
				form: deleteOrder,
				id: String(order.id),
				title: m.orders_delete_title({ number: order.number }),
				description: m.orders_delete_description(),
			}
		: undefined}
	subject={{ type: "order", id: order.id }}
	slots={points.detail}
	slotProps={{ number: order.number }}
>
	{#snippet badges()}
		<EnumBadge display={orderStatusDisplay} value={order.status} />
		<OrderTags tags={data.tags} />
		<EnumBadge display={orderPriorityDisplay} value={order.priority} />
		<TypeLabel type={order.type} />
	{/snippet}

	{#snippet main()}
		{#if data.request}
			<AcceptanceCard {order} request={data.request} />
		{/if}
		<OrderLinesCard {order} totals={data.totals} />
		<UnitsCard {order} />
		{#if order.units.length}
			<EquipmentHistoryCard units={order.units} history={await getOrderHistory(order.number)} />
		{/if}
	{/snippet}

	{#snippet side()}
		<ScheduleCard {order} />
		<WorkReport notes={data.notes} signoff={data.signoff} />
		<CustomerCard customer={order.customer} title={m.orders_customer()} />
		{#each data.sites as site (site.id)}
			<SiteCard {site} title={m.orders_site()} />
		{/each}
		<EngineerCard engineer={order.engineer} />
	{/snippet}
</RecordPage>
