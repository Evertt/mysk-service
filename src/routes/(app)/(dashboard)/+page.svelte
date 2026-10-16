<script lang="ts">
	import { resolve } from "$app/paths";

	import { getRecentActivity } from "#lib/components/activity/activity.remote.ts";
	import { refreshOnActivity } from "#lib/components/activity/live-activity.svelte.ts";
	import StatCard from "#lib/components/stat-card.svelte";
	import { CustomerLink } from "#lib/customers/components.ts";
	import { cards, stats } from "#lib/dashboard/extensions.ts";
	import { EngineerLink } from "#lib/engineers/components.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { formatCents, formatDate, formatNumber } from "#lib/i18n/index.ts";
	import { OrderLink, PriorityBadge } from "#lib/orders/components.ts";

	import { cardGrid, statGrid } from "./dashboard-grids.ts";
	import { getCharts, getDashboard } from "./dashboard.remote.ts";
	import EquipmentByStatusChart from "./equipment-by-status-chart.svelte";
	import { masonry } from "./masonry.ts";
	import OrdersPerWeekChart from "./orders-per-week-chart.svelte";
	import RecentActivity from "./recent-activity.svelte";
	import RevenuePerMonthChart from "./revenue-per-month-chart.svelte";

	const data = $derived(await getDashboard());
	const charts = $derived(await getCharts());

	// Live: when anyone changes something, the numbers, charts and recent activity are asked for
	// again (once for a burst of changes). The modules' stat cards look after their own.
	refreshOnActivity(() =>
		Promise.all([getDashboard().refresh(), getCharts().refresh(), getRecentActivity().refresh()]),
	);
</script>

<svelte:head>
	<title>{m.dashboard_title()}</title>
</svelte:head>

<div class="flex flex-col gap-1">
	<h1 class="text-2xl font-semibold tracking-tight">{m.dashboard_title()}</h1>
	<p class="text-muted-foreground">{m.dashboard_description()}</p>
</div>

<div class={statGrid}>
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
	<ExtensionSlot point={stats} props={{}} />
</div>

<!-- The cards, packed into columns (`masonry.ts`). The slot's wrapper is `display: contents`, so
	each of the modules' cards is placed on its own. -->
<div class={cardGrid} data-dashboard-cards {@attach masonry}>
	<Card.Root data-wide>
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
	<EquipmentByStatusChart data={charts.equipmentByStatus} />
	<RevenuePerMonthChart data={charts.revenuePerMonth} />
	<OrdersPerWeekChart data={charts.ordersPerWeek} />
	<ExtensionSlot point={cards} props={{}} />
	<RecentActivity />
</div>
