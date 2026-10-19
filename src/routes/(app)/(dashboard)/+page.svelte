<script lang="ts">
	import { resolve } from "$app/paths";
	import BanknoteIcon from "@lucide/svelte/icons/banknote";
	import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
	import InboxIcon from "@lucide/svelte/icons/inbox";
	import SirenIcon from "@lucide/svelte/icons/siren";
	import WrenchIcon from "@lucide/svelte/icons/wrench";

	import { getCurrentUser } from "#lib/auth/session.remote.ts";
	import { getRecentActivity } from "#lib/components/activity/activity.remote.ts";
	import { refreshOnActivity } from "#lib/components/activity/live-activity.svelte.ts";
	import StatTile from "#lib/components/stat-tile.svelte";
	import {
		compare,
		formatChange,
		formatShare,
		type StatTrend,
	} from "#lib/components/stat-trend.ts";
	import { CustomerLink } from "#lib/customers/components.ts";
	import { cards, stats } from "#lib/dashboard/extensions.ts";
	import { getTimeZone } from "#lib/dates.ts";
	import { EngineerLink } from "#lib/engineers/components.ts";
	import CrashSwitch from "#lib/errors/crash-switch.svelte";
	import { crashSwitches } from "#lib/errors/crash-switch.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { formatCents, formatDate, formatNumber } from "#lib/i18n/index.ts";
	import { OrderLink, PriorityBadge } from "#lib/orders/components.ts";
	import { unitsSummary } from "#lib/orders/index.ts";

	import { cardGrid, statGrid } from "./dashboard-grids.ts";
	import { getCharts, getDashboard } from "./dashboard.remote.ts";
	import EquipmentByStatusChart from "./equipment-by-status-chart.svelte";
	import { masonry } from "./masonry.ts";
	import OrdersPerWeekChart from "./orders-per-week-chart.svelte";
	import RecentActivity from "./recent-activity.svelte";
	import RevenuePerMonthChart from "./revenue-per-month-chart.svelte";

	const data = $derived(await getDashboard());
	const charts = $derived(await getCharts());
	const user = $derived(await getCurrentUser());

	// "Good morning, Jan", by the hour in the user's time zone (the night is still the evening).
	const greeting = $derived.by(() => {
		const name = user.name.split(" ")[0];
		const hour = Temporal.Now.zonedDateTimeISO(getTimeZone()).hour;
		if (hour >= 6 && hour < 12) return m.dashboard_greeting_morning({ name });
		if (hour >= 12 && hour < 18) return m.dashboard_greeting_afternoon({ name });
		return m.dashboard_greeting_evening({ name });
	});

	// The tiles' trends: the orders made in the last 7 days against the 7 before (neither good nor
	// bad news), and the revenue against the 30 days before (none without revenue then).
	const madeTrend = $derived.by((): StatTrend => {
		const { direction, tone, change } = compare(data.made.week, data.made.weekBefore, "none");
		return {
			direction,
			tone,
			text: m.dashboard_trend_made({
				count: formatNumber(data.made.week),
				change: formatChange(change),
			}),
		};
	});
	const revenueTrend = $derived.by((): StatTrend | undefined => {
		const { direction, tone, share } = compare(data.revenue.total, data.revenue.previous);
		if (share === null) return undefined;
		return { direction, tone, text: m.dashboard_trend_revenue({ change: formatShare(share) }) };
	});

	// Live: when anyone changes something, the numbers, charts and recent activity are asked for
	// again (once for a burst of changes). The modules' stat cards look after their own.
	refreshOnActivity(() =>
		Promise.all([getDashboard().refresh(), getCharts().refresh(), getRecentActivity().refresh()]),
	);
</script>

<svelte:head>
	<title>{m.dashboard_title()}</title>
</svelte:head>

{#if crashSwitches}
	<!-- A test switch (e2e and dev only): the page crashes when a test asks. -->
	<CrashSwitch where="page:dashboard" />
{/if}

<div class="flex flex-col gap-1">
	<h1 class="text-2xl font-semibold tracking-tight">{greeting}</h1>
	<p class="text-muted-foreground">{m.dashboard_greeting_line()}</p>
</div>

<div class={statGrid}>
	<StatTile
		layout="stacked"
		icon={ClipboardListIcon}
		tone="brand"
		label={m.dashboard_open_orders()}
		value={formatNumber(data.open.total)}
		detail={m.dashboard_without_engineer({ count: formatNumber(data.open.unassigned ?? 0) })}
		trend={madeTrend}
	/>
	<!-- The orders customers reported in their portal, to accept or reject: opens the list of them. -->
	<a
		href={`${resolve("/(app)/orders")}?status=awaiting_acceptance`}
		class="flex rounded-lg transition-opacity *:flex-1 hover:opacity-80"
		data-awaiting-link
	>
		<StatTile
			layout="stacked"
			icon={InboxIcon}
			tone="info"
			label={m.dashboard_awaiting_acceptance()}
			value={formatNumber(data.awaiting)}
			detail={m.dashboard_awaiting_acceptance_description()}
		/>
	</a>
	<StatTile
		layout="stacked"
		icon={SirenIcon}
		tone="danger"
		label={m.dashboard_urgent()}
		value={formatNumber(data.open.urgent ?? 0)}
		detail={m.dashboard_urgent_description()}
	/>
	<StatTile
		layout="stacked"
		icon={BanknoteIcon}
		tone="success"
		label={m.dashboard_revenue()}
		value={formatCents(data.revenue.total)}
		detail={m.dashboard_revenue_orders({ count: data.revenue.orders })}
		trend={revenueTrend}
	/>
	<StatTile
		layout="stacked"
		icon={WrenchIcon}
		tone="warning"
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
						<Table.Head>{m.dashboard_column_equipment()}</Table.Head>
						<Table.Head>{m.dashboard_column_engineer()}</Table.Head>
						<Table.Head>{m.dashboard_column_priority()}</Table.Head>
						<Table.Head class="text-right">{m.dashboard_column_scheduled()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.upcoming as order (order.id)}
						<!-- The first unit and how many more, e.g. "Deur 07 +14". -->
						{@const units = unitsSummary(order.unit, order.unitCount)}
						<Table.Row>
							<Table.Cell><OrderLink number={order.number} /></Table.Cell>
							<Table.Cell>
								<CustomerLink code={order.customer.code} name={order.customer.name} />
							</Table.Cell>
							<Table.Cell data-units>
								{#if units}
									<span class="block max-w-48 truncate" title={units}>{units}</span>
								{:else}
									<span class="text-muted-foreground">{m.dashboard_new_installation()}</span>
								{/if}
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
