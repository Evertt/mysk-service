<!--
	@component
	The key figures of a unit's service history: its orders by type, what its service cost, when it
	was last serviced and how often it needs repairs.
-->
<script lang="ts">
	import StatCard from "#lib/components/stat-card.svelte";
	import { formatCents, formatDate, formatNumber } from "#lib/format.js";
	import { orderTypes } from "#lib/models.js";
	import { types } from "#lib/orders/display.js";

	import { getServiceHistory } from "./service-history.remote.js";

	let { serial }: { serial: string } = $props();

	const { stats } = $derived(await getServiceHistory(serial));
	const betweenRepairs = $derived(
		stats.daysBetweenRepairs !== null
			? m.equipment_stats_between_repairs({
					days: m.equipment_count_days({ count: stats.daysBetweenRepairs }),
				})
			: stats.repairs
				? m.equipment_stats_one_repair()
				: m.equipment_stats_no_repairs(),
	);
</script>

<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
	<Card.Root>
		<Card.Header>
			<Card.Description>{m.equipment_stats_orders()}</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{formatNumber(stats.orders)}</Card.Title>
			<Card.Action>
				<Badge variant="outline">
					{m.equipment_stats_open({ count: formatNumber(stats.openOrders) })}
				</Badge>
			</Card.Action>
		</Card.Header>
		<Card.Footer>
			<ul
				aria-label={m.equipment_stats_orders_by_type()}
				class="flex flex-wrap gap-x-3 gap-y-1 text-sm"
			>
				{#each orderTypes as type (type)}
					{@const display = types[type]}
					<li class="inline-flex items-center gap-1 text-muted-foreground">
						<display.icon class="size-3.5" />
						{display.label}
						<span class="font-medium text-foreground tabular-nums">
							{formatNumber(stats.ordersByType[type])}
						</span>
					</li>
				{/each}
			</ul>
		</Card.Footer>
	</Card.Root>
	<StatCard
		label={m.equipment_stats_cost()}
		value={formatCents(stats.cost)}
		detail={m.equipment_stats_cost_orders({ count: stats.doneOrders })}
	/>
	<StatCard
		label={m.equipment_stats_last_service()}
		value={stats.lastService ? formatDate(stats.lastService) : m.equipment_stats_never()}
		detail={m.equipment_stats_last_service_description()}
	/>
	<StatCard
		label={m.equipment_stats_since_repair()}
		value={stats.daysSinceLastRepair === null
			? "—"
			: m.equipment_count_days({ count: stats.daysSinceLastRepair })}
		detail={betweenRepairs}
	/>
</div>
