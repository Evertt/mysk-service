<!--
	@component
	A customer's latest orders across all their equipment, with a link to all of them in the orders
	list.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";

	import OrderLink from "#lib/components/orders/order-link.svelte";
	import StatusBadge from "#lib/components/orders/status-badge.svelte";
	import TypeLabel from "#lib/components/orders/type-label.svelte";
	import { formatCents, formatDate } from "#lib/format.js";

	import { getCustomerActivity } from "./activity.remote.js";

	let { code }: { code: string } = $props();

	const activity = $derived(await getCustomerActivity(code));
	const allOrders = $derived(`${resolve("/(app)/orders")}?customer=${encodeURIComponent(code)}`);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Recent activity</Card.Title>
		<Card.Description>The latest orders across all their equipment.</Card.Description>
		{#if activity.total}
			<Card.Action>
				<Button variant="outline" size="sm" href={allOrders}>
					{activity.total === 1 ? "View the order" : `View all ${activity.total} orders`}
					<ArrowRightIcon data-icon="inline-end" />
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if activity.orders.length}
			<ul aria-label="Recent activity" class="flex flex-col divide-y">
				{#each activity.orders as order (order.id)}
					<li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
						<div class="flex min-w-0 flex-1 flex-col gap-0.5">
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
								<OrderLink number={order.number} />
								<TypeLabel type={order.type} />
							</div>
							{#if order.equipment}
								<a
									href={resolve("/(app)/equipment/[serial]", {
										serial: order.equipment.serialNumber,
									})}
									class="truncate text-sm text-muted-foreground underline-offset-4 hover:underline"
								>
									{order.equipment.manufacturer}
									{order.equipment.model} · {order.equipment.serialNumber}
								</a>
							{:else}
								<span class="text-sm text-muted-foreground">New installation</span>
							{/if}
						</div>
						<StatusBadge status={order.status} />
						<div class="flex w-32 flex-col items-end">
							<span class="text-sm font-medium tabular-nums">{formatCents(order.total)}</span>
							<span class="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
								{#if order.completedAt}
									Completed {formatDate(order.completedAt)}
								{:else if order.scheduledFor}
									Scheduled {formatDate(order.scheduledFor)}
								{:else}
									Created {formatDate(order.createdAt)}
								{/if}
							</span>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title>No orders</Empty.Title>
					<Empty.Description
						>Nothing has been quoted or done for this customer yet.</Empty.Description
					>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
