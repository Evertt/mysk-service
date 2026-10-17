<!--
	@component
	The latest orders on a location's units, newest first: each with which of the location's units
	it's about, its type, status, engineer and when it happened.
-->
<script lang="ts">
	import { EngineerLink } from "#lib/engineers/components.ts";
	import { formatDate, label } from "#lib/i18n/index.ts";
	import { OrderLink, StatusBadge as OrderStatusBadge } from "#lib/orders/components.ts";

	import { orderDate } from "../detail/service-history.ts";
	import type { getLocation } from "./locations.remote.ts";

	let { orders }: { orders: Awaited<ReturnType<typeof getLocation>>["orders"] } = $props();
</script>

<Card.Root data-testid="location-history">
	<Card.Header>
		<Card.Title>{m.equipment_location_history_title()}</Card.Title>
		<Card.Description>{m.equipment_location_history_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if orders.length}
			<ul class="flex flex-col divide-y">
				{#each orders as order (order.id)}
					<li class="flex flex-col gap-1 py-3 text-sm first:pt-0 last:pb-0">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<span class="flex items-center gap-2">
								<OrderLink number={order.number} />
								<span class="text-muted-foreground">{label("orderType", order.type)}</span>
							</span>
							<OrderStatusBadge status={order.status} />
						</div>
						<p class="line-clamp-2">{order.description}</p>
						<p class="flex flex-wrap gap-x-2 text-muted-foreground">
							<span class="tabular-nums">{formatDate(orderDate(order))}</span>
							<span>·</span>
							<span>{order.units.join(", ")}</span>
							{#if order.engineer}
								<span>·</span>
								<EngineerLink id={order.engineer.id} name={order.engineer.name} />
							{/if}
						</p>
					</li>
				{/each}
			</ul>
		{:else}
			<Empty.Root class="border p-6">
				<Empty.Header>
					<Empty.Title>{m.equipment_location_history_empty()}</Empty.Title>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
