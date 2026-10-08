<script lang="ts">
	import { resolve } from "$app/paths";

	import CustomerLink from "#lib/components/customers/customer-link.svelte";
	import EngineerLink from "#lib/components/engineers/engineer-link.svelte";
	import OrderLink from "#lib/components/orders/order-link.svelte";
	import PriorityBadge from "#lib/components/orders/priority-badge.svelte";
	import { formatCents, formatDate, formatNumber } from "#lib/format.js";

	import { getDashboard } from "./dashboard.remote.js";
	import ModuleSlots from "./module-slots.svelte";
	import RecentActivity from "./recent-activity.svelte";

	const data = $derived(await getDashboard());
</script>

<svelte:head>
	<title>{m.dashboard_title()}</title>
</svelte:head>

<div class="flex flex-col gap-1">
	<h1 class="text-2xl font-semibold tracking-tight">{m.dashboard_title()}</h1>
	<p class="text-muted-foreground">{m.dashboard_description()}</p>
</div>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
	<Card.Root>
		<Card.Header>
			<Card.Description>{m.dashboard_open_orders()}</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{formatNumber(data.open.total)}</Card.Title>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">
			{m.dashboard_without_engineer({ count: formatNumber(data.open.unassigned ?? 0) })}
		</Card.Footer>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>{m.dashboard_urgent()}</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{formatNumber(data.open.urgent ?? 0)}</Card.Title>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">
			{m.dashboard_urgent_description()}
		</Card.Footer>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>{m.dashboard_revenue()}</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{formatCents(data.revenue.total)}</Card.Title>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">
			{m.dashboard_revenue_orders({ count: data.revenue.orders })}
		</Card.Footer>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>{m.dashboard_attention()}</Card.Description>
			<Card.Title class="text-3xl tabular-nums"
				>{formatNumber(data.fleet.attention ?? 0)}</Card.Title
			>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">
			{m.dashboard_attention_of({ count: data.fleet.total })}
		</Card.Footer>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>{m.dashboard_low_stock()}</Card.Description>
			<Card.Title class="text-3xl tabular-nums"
				>{formatNumber(data.stock.low + data.stock.out)}</Card.Title
			>
			<Card.Action>
				<!-- The materials list, filtered to the low and out of stock ones. -->
				<Button variant="outline" size="sm" href="{resolve('/(app)/materials')}?stock=out,low">
					{m.common_view()}
				</Button>
			</Card.Action>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">
			{m.dashboard_low_stock_of({ out: formatNumber(data.stock.out), count: data.stock.total })}
		</Card.Footer>
	</Card.Root>
</div>

<ModuleSlots name="dashboard" props={{}} class="grid items-start gap-6 lg:grid-cols-2" />

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
