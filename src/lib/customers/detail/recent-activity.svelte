<!--
	@component
	A customer's latest orders across all their equipment, with a link to all of them in the orders
	list.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";

	import { joinValues } from "#lib/components/data-table/url-state.ts";
	import { unitLine } from "#lib/equipment/index.ts";
	import { formatCents, formatDate, formatNumber } from "#lib/i18n/index.ts";
	import { OrderLink, StatusBadge, TypeLabel } from "#lib/orders/components.ts";

	import { getCustomerActivity } from "./activity.remote.ts";

	let { code }: { code: string } = $props();

	const activity = $derived(await getCustomerActivity(code));
	// The orders list, filtered on the customer (see `url-state.ts`).
	const allOrders = $derived(
		`${resolve("/(app)/orders")}?customer=${encodeURIComponent(joinValues([code]))}`,
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.customers_recent_title()}</Card.Title>
		<Card.Description>{m.customers_recent_description()}</Card.Description>
		{#if activity.total}
			<Card.Action>
				<Button variant="outline" size="sm" href={allOrders}>
					{m.customers_recent_view_all({ count: activity.total })}
					<ArrowRightIcon data-icon="inline-end" />
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if activity.orders.length}
			<ul aria-label={m.customers_recent_title()} class="flex flex-col divide-y">
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
									{unitLine(order.equipment)}
									{#if order.unitCount > 1}
										<span class="tabular-nums">
											+{formatNumber(order.unitCount - 1)}
										</span>
									{/if}
								</a>
							{:else}
								<span class="text-sm text-muted-foreground">
									{m.customers_recent_new_installation()}
								</span>
							{/if}
						</div>
						<StatusBadge status={order.status} />
						<div class="flex w-32 flex-col items-end">
							<span data-cost="total" class="text-sm font-medium tabular-nums">
								{formatCents(order.total)}
							</span>
							<span class="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
								{#if order.completedAt}
									{m.customers_recent_completed({ date: formatDate(order.completedAt) })}
								{:else if order.scheduledFor}
									{m.customers_recent_scheduled({ date: formatDate(order.scheduledFor) })}
								{:else}
									{m.customers_recent_created({ date: formatDate(order.createdAt) })}
								{/if}
							</span>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title>{m.customers_recent_empty_title()}</Empty.Title>
					<Empty.Description>{m.customers_recent_empty_description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
