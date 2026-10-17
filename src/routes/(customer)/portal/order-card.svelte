<!--
	@component
	One of the customer's orders in the portal's lists: a link to it, with what it's about, its
	units and where it stands; a rejected report shows why. A card of its own, or, in an
	`order-list.svelte` that's wide enough, a row of its table: number, what, status and date in
	columns.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

	import { unitTitle } from "#lib/equipment/index.ts";
	import { formatDate, formatNumber, label } from "#lib/i18n/index.ts";
	import type { OrderPriority, OrderStatus, OrderType } from "#lib/models.ts";

	import ClientStatusBadge from "./client-status-badge.svelte";

	let {
		order,
	}: {
		order: {
			number: string;
			type: OrderType;
			status: OrderStatus;
			priority: OrderPriority;
			description: string;
			createdAt: Temporal.Instant;
			scheduledFor: Temporal.Instant | null;
			completedAt: Temporal.Instant | null;
			rejectionReason: string | null;
			/** Who reported it in the portal, if it was reported there. */
			reportedBy: string | null;
			units: { name: string | null; manufacturer: string; model: string }[];
		};
	} = $props();

	const when = $derived(
		order.completedAt
			? m.client_completed_on({ date: formatDate(order.completedAt) })
			: order.scheduledFor && order.status !== "cancelled"
				? m.client_planned_on({ date: formatDate(order.scheduledFor) })
				: order.reportedBy
					? m.client_reported_on({ date: formatDate(order.createdAt) })
					: m.client_created_on({ date: formatDate(order.createdAt) }),
	);
	const units = $derived(
		order.units.length
			? order.units.length > 1
				? m.client_units_more({
						unit: unitTitle(order.units[0]),
						more: formatNumber(order.units.length - 1),
					})
				: unitTitle(order.units[0])
			: null,
	);
</script>

<a
	href={resolve("/(customer)/portal/orders/[number]", { number: order.number })}
	data-order={order.number}
	class="order-card rounded-xl border bg-card p-4 text-card-foreground shadow-xs transition-colors hover:bg-accent active:bg-accent"
>
	<span class="order-title truncate font-medium">
		{label("orderType", order.type)}{units ? ` · ${units}` : ""}
	</span>
	<span class="order-number text-xs text-muted-foreground tabular-nums">{order.number}</span>
	<p class="order-description line-clamp-2 text-sm">{order.description}</p>
	{#if order.rejectionReason}
		<p class="order-rejection text-sm text-destructive">
			{m.client_rejected_because({ reason: order.rejectionReason })}
		</p>
	{/if}
	<span class="order-status">
		<ClientStatusBadge status={order.status} rejectionReason={order.rejectionReason} />
	</span>
	<span class="order-when text-xs text-muted-foreground">{when}</span>
	<ChevronRightIcon class="order-chevron size-5 shrink-0 self-center text-muted-foreground" />
</a>

<style>
	/* A card: what and its number, the description (and why it was rejected), then its status and
	   date, with the chevron on the right. */
	.order-card {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		grid-template-areas:
			"title title number chevron"
			"description description description chevron"
			"rejection rejection rejection chevron"
			"status when when chevron";
		align-items: center;
		gap: 0.5rem;
	}
	.order-title {
		grid-area: title;
	}
	.order-number {
		grid-area: number;
		justify-self: end;
	}
	.order-description {
		grid-area: description;
	}
	.order-rejection {
		grid-area: rejection;
	}
	.order-status {
		grid-area: status;
		display: flex;
	}
	.order-when {
		grid-area: when;
	}
	.order-card :global(.order-chevron) {
		grid-area: chevron;
	}

	/* A row of the list's table (see `order-list.svelte`): the number, what (with its description
	   under it), the status and the date in columns. */
	@container order-list (width >= 50rem) {
		.order-card {
			grid-template-columns: 9rem minmax(0, 1fr) 10rem 11rem auto;
			grid-template-areas:
				"number title status when chevron"
				"number description status when chevron"
				"number rejection status when chevron";
			column-gap: 1rem;
			row-gap: 0.125rem;
			/* Under the heads, or the row before. */
			border-width: 1px 0 0;
			border-radius: 0;
			box-shadow: none;
			padding: 0.75rem 1rem;
		}
		.order-number {
			justify-self: start;
			align-self: start;
			white-space: nowrap;
			font-size: 0.875rem;
			line-height: 1.25rem;
			color: var(--foreground);
		}
		.order-description {
			-webkit-line-clamp: 1;
			line-clamp: 1;
			color: var(--muted-foreground);
		}
		.order-status,
		.order-when {
			align-self: start;
		}
		.order-when {
			font-size: 0.875rem;
			line-height: 1.25rem;
		}
	}
</style>
