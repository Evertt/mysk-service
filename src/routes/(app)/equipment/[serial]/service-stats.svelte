<!--
	@component
	The key figures of a unit's service history: its orders by type, what its service cost, when it
	was last serviced and how often it needs repairs.
-->
<script lang="ts">
	import { types } from "#lib/components/orders/display.js";
	import { formatCents, formatDate, formatNumber } from "#lib/format.js";
	import { orderTypes } from "#lib/models.js";

	import { getServiceHistory } from "./service-history.remote.js";

	let { serial }: { serial: string } = $props();

	const { stats } = $derived(await getServiceHistory(serial));

	const plural = (n: number, one: string, many: string) =>
		`${formatNumber(n)} ${n === 1 ? one : many}`;
</script>

<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
	<Card.Root>
		<Card.Header>
			<Card.Description>Orders</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{stats.orders}</Card.Title>
			<Card.Action>
				<Badge variant="outline">{stats.openOrders} open</Badge>
			</Card.Action>
		</Card.Header>
		<Card.Footer>
			<ul aria-label="Orders by type" class="flex flex-wrap gap-x-3 gap-y-1 text-sm">
				{#each orderTypes as type (type)}
					{@const display = types[type]}
					<li class="inline-flex items-center gap-1 text-muted-foreground">
						<display.icon class="size-3.5" />
						{display.label}
						<span class="font-medium text-foreground tabular-nums">{stats.ordersByType[type]}</span>
					</li>
				{/each}
			</ul>
		</Card.Footer>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>Service cost</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{formatCents(stats.cost)}</Card.Title>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">
			Materials and labour of {plural(stats.doneOrders, "completed order", "completed orders")}
		</Card.Footer>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>Last service</Card.Description>
			<Card.Title class="text-3xl tabular-nums">
				{stats.lastService ? formatDate(stats.lastService) : "Never"}
			</Card.Title>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">Latest completed order</Card.Footer>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>Since last repair</Card.Description>
			<Card.Title class="text-3xl tabular-nums">
				{stats.daysSinceLastRepair === null
					? "—"
					: plural(stats.daysSinceLastRepair, "day", "days")}
			</Card.Title>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">
			{#if stats.daysBetweenRepairs !== null}
				Mean time between repairs: {plural(stats.daysBetweenRepairs, "day", "days")}
			{:else if stats.repairs}
				1 repair so far
			{:else}
				No repairs so far
			{/if}
		</Card.Footer>
	</Card.Root>
</div>
