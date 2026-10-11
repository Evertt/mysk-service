<script lang="ts">
	import { resolve } from "$app/paths";

	import StatCard from "#lib/components/stat-card.svelte";
	import { CustomerLink } from "#lib/customers/components.ts";
	import { cards } from "#lib/dashboard/extensions.ts";
	import { EngineerLink } from "#lib/engineers/components.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { formatCents, formatDate, formatNumber } from "#lib/i18n/index.ts";
	import { OrderLink, PriorityBadge } from "#lib/orders/components.ts";

	import { getCharts, getDashboard } from "./dashboard.remote.ts";
	import EquipmentByStatusChart from "./equipment-by-status-chart.svelte";
	import OrdersPerWeekChart from "./orders-per-week-chart.svelte";
	import RecentActivity from "./recent-activity.svelte";
	import RevenuePerMonthChart from "./revenue-per-month-chart.svelte";

	const data = $derived(await getDashboard());
	const charts = $derived(await getCharts());
</script>

<svelte:head>
	<title>{m.dashboard_title()}</title>
</svelte:head>

<div class="flex flex-col gap-1">
	<h1 class="text-2xl font-semibold tracking-tight">{m.dashboard_title()}</h1>
	<p class="text-muted-foreground">{m.dashboard_description()}</p>
</div>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
	<StatCard
		label={m.dashboard_open_orders()}
		value={formatNumber(data.open.total)}
		detail={m.dashboard_without_engineer({ count: formatNumber(data.open.unassigned ?? 0) })}
	/>
	<StatCard
		label={m.dashboard_urgent()}
		value={formatNumber(data.open.urgent ?? 0)}
		detail={m.dashboard_urgent_description()}
	/>
	<StatCard
		label={m.dashboard_revenue()}
		value={formatCents(data.revenue.total)}
		detail={m.dashboard_revenue_orders({ count: data.revenue.orders })}
	/>
	<StatCard
		label={m.dashboard_attention()}
		value={formatNumber(data.fleet.attention ?? 0)}
		detail={m.dashboard_attention_of({ count: data.fleet.total })}
	/>
	<StatCard
		label={m.dashboard_low_stock()}
		value={formatNumber(data.stock.low + data.stock.out)}
		detail={m.dashboard_low_stock_of({
			out: formatNumber(data.stock.out),
			count: data.stock.total,
		})}
	>
		{#snippet action()}
			<!-- The materials list, filtered to the low and out of stock ones. -->
			<Button variant="outline" size="sm" href="{resolve('/(app)/materials')}?stock=out,low">
				{m.common_view()}
			</Button>
		{/snippet}
	</StatCard>
</div>

<div class="grid items-start gap-6 lg:grid-cols-2">
	<OrdersPerWeekChart data={charts.ordersPerWeek} />
	<RevenuePerMonthChart data={charts.revenuePerMonth} />
	<EquipmentByStatusChart data={charts.equipmentByStatus} />
</div>

<ExtensionSlot point={cards} props={{}} class="grid items-start gap-6 lg:grid-cols-2" />

<Card.Root>
	<Card.Header>
		<Card.Title>{m.dashboard_upcoming()}</Card.Title>
		<Card.Description>{m.dashboard_upcoming_description()}</Card.Description>
		<Card.Action>
			<Button variant="outline" size="sm" href={resolve("/(app)/orders")}>
				{m.dashboard_all_orders()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.dashboard_column_order()}</Table.Head>
					<Table.Head>{m.dashboard_column_customer()}</Table.Head>
					<Table.Head>{m.dashboard_column_engineer()}</Table.Head>
					<Table.Head>{m.dashboard_column_priority()}</Table.Head>
					<Table.Head class="text-right">{m.dashboard_column_scheduled()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.upcoming as order (order.id)}
					<Table.Row>
						<Table.Cell><OrderLink number={order.number} /></Table.Cell>
						<Table.Cell>
							<CustomerLink code={order.customer.code} name={order.customer.name} />
						</Table.Cell>
						<Table.Cell>
							{#if order.engineer}
								<EngineerLink id={order.engineer.id} name={order.engineer.name} />
							{:else}
								<span class="text-muted-foreground">{m.common_unassigned()}</span>
							{/if}
						</Table.Cell>
						<Table.Cell><PriorityBadge priority={order.priority} /></Table.Cell>
						<Table.Cell class="text-right tabular-nums">
							{order.scheduledFor && formatDate(order.scheduledFor)}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Root>

<RecentActivity />
