<script lang="ts">
	import { resolve } from "$app/paths";

	import CustomerLink from "#lib/components/customers/customer-link.svelte";
	import EngineerLink from "#lib/components/engineers/engineer-link.svelte";
	import OrderLink from "#lib/components/orders/order-link.svelte";
	import PriorityBadge from "#lib/components/orders/priority-badge.svelte";
	import { formatCents, formatDate } from "#lib/format.js";

	import { getDashboard } from "./dashboard.remote.js";
	import ModuleSlots from "./module-slots.svelte";

	const data = $derived(await getDashboard());
</script>

<svelte:head>
	<title>Dashboard</title>
</svelte:head>

<div class="flex flex-col gap-1">
	<h1 class="text-2xl font-semibold tracking-tight">Dashboard</h1>
	<p class="text-muted-foreground">How service operations are doing right now.</p>
</div>

<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
	<Card.Root>
		<Card.Header>
			<Card.Description>Open orders</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{data.open.total}</Card.Title>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">
			{data.open.unassigned ?? 0} without an engineer
		</Card.Footer>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>Urgent</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{data.open.urgent ?? 0}</Card.Title>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">Open orders with urgent priority</Card.Footer
		>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>Revenue, last 30 days</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{formatCents(data.revenue.total)}</Card.Title>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">
			From {data.revenue.orders} completed orders
		</Card.Footer>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>Equipment needing attention</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{data.fleet.attention ?? 0}</Card.Title>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">
			Of {data.fleet.total} installed units
		</Card.Footer>
	</Card.Root>
</div>

<ModuleSlots name="dashboard" props={{}} class="grid items-start gap-6 lg:grid-cols-2" />

<Card.Root>
	<Card.Header>
		<Card.Title>Upcoming work</Card.Title>
		<Card.Description>The next scheduled orders.</Card.Description>
		<Card.Action>
			<Button variant="outline" size="sm" href={resolve("/(app)/orders")}>All orders</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Order</Table.Head>
					<Table.Head>Customer</Table.Head>
					<Table.Head>Engineer</Table.Head>
					<Table.Head>Priority</Table.Head>
					<Table.Head class="text-right">Scheduled</Table.Head>
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
								<span class="text-muted-foreground">Unassigned</span>
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
