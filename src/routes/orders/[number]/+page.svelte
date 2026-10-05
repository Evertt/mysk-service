<script lang="ts">
	import { resolve } from "$app/paths";

	import EquipmentStatusBadge from "#lib/components/equipment/status-badge.svelte";
	import PriorityBadge from "#lib/components/orders/priority-badge.svelte";
	import StatusBadge from "#lib/components/orders/status-badge.svelte";
	import TypeLabel from "#lib/components/orders/type-label.svelte";
	import { formatCents, formatDate, humanize } from "#lib/format.js";

	import { getOrder } from "../orders.remote.js";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getOrder(params.number));

	const order = $derived(data.order);
	const { customer, equipment, engineer } = $derived(data.order);
	const underWarranty = $derived(equipment && order.createdAt < equipment.warrantyUntil);
</script>

<svelte:head>
	<title>{order.number} · Orders</title>
</svelte:head>

{#snippet field(label: string, value: string | null | undefined, href?: string)}
	<div class="flex flex-col gap-0.5">
		<dt class="text-xs text-muted-foreground">{label}</dt>
		<dd class="text-sm wrap-break-word">
			{#if value && href}
				<a {href} class="underline-offset-4 hover:underline">{value}</a>
			{:else}
				{value ?? "—"}
			{/if}
		</dd>
	</div>
{/snippet}

<div class="flex flex-col gap-4">
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/orders")}>Orders</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{order.number}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>

	<div class="flex flex-col gap-2">
		<div class="flex flex-wrap items-center gap-3">
			<h1 class="text-2xl font-semibold tracking-tight">{order.number}</h1>
			<StatusBadge status={order.status} />
			<PriorityBadge priority={order.priority} />
		</div>
		<div class="flex flex-wrap items-center gap-2 text-muted-foreground">
			<TypeLabel type={order.type} />
			<Separator orientation="vertical" class="h-4" />
			<span>{order.description}</span>
		</div>
	</div>
</div>

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="flex min-w-0 flex-col gap-6 lg:col-span-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Materials and labour</Card.Title>
				<Card.Description>Prices as quoted when the order was created.</Card.Description>
			</Card.Header>
			<Card.Content>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Material</Table.Head>
							<Table.Head class="text-right">Quantity</Table.Head>
							<Table.Head class="text-right">Unit price</Table.Head>
							<Table.Head class="text-right">Amount</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each order.lines as line (line.id)}
							<Table.Row>
								<Table.Cell>
									<div class="flex flex-col">
										<span>{line.material.name}</span>
										<span class="text-xs text-muted-foreground">{line.material.sku}</span>
									</div>
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{line.quantity}
									{line.material.unit}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{formatCents(line.unitPrice)}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{formatCents(line.total)}</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={4} class="text-center text-muted-foreground">
									No materials on this order.
								</Table.Cell>
							</Table.Row>
						{/each}
						<Table.Row>
							<Table.Cell>
								<div class="flex flex-col">
									<span>Labour</span>
									<span class="text-xs text-muted-foreground">
										{engineer ? `${engineer.name}'s rate` : "Standard rate, no engineer assigned"}
									</span>
								</div>
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{order.laborHours} h</Table.Cell>
							<Table.Cell class="text-right tabular-nums">
								{formatCents(data.totals.laborRate)}
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">
								{formatCents(data.totals.labor)}
							</Table.Cell>
						</Table.Row>
					</Table.Body>
					<Table.Footer>
						<Table.Row>
							<Table.Cell colspan={3}>Total</Table.Cell>
							<Table.Cell class="text-right tabular-nums">
								{formatCents(data.totals.total)}
							</Table.Cell>
						</Table.Row>
					</Table.Footer>
				</Table.Root>
			</Card.Content>
		</Card.Root>

		{#if equipment}
			<Card.Root>
				<Card.Header>
					<Card.Title>Service history</Card.Title>
					<Card.Description>Other orders for {equipment.serialNumber}.</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if data.history.length}
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head>Order</Table.Head>
									<Table.Head>Type</Table.Head>
									<Table.Head>Status</Table.Head>
									<Table.Head class="text-right">Created</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each data.history as other (other.id)}
									<Table.Row>
										<Table.Cell>
											<a
												href={resolve("/orders/[number]", { number: other.number })}
												class="font-medium underline-offset-4 hover:underline"
											>
												{other.number}
											</a>
										</Table.Cell>
										<Table.Cell><TypeLabel type={other.type} /></Table.Cell>
										<Table.Cell><StatusBadge status={other.status} /></Table.Cell>
										<Table.Cell class="text-right tabular-nums">
											{formatDate(other.createdAt)}
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					{:else}
						<Empty.Root class="p-6">
							<Empty.Header>
								<Empty.Title>No other orders</Empty.Title>
								<Empty.Description>This is the first order for this unit.</Empty.Description>
							</Empty.Header>
						</Empty.Root>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}
	</div>

	<div class="flex min-w-0 flex-col gap-6">
		<Card.Root>
			<Card.Header>
				<Card.Title>Schedule</Card.Title>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-3 gap-4">
					{@render field("Created", formatDate(order.createdAt))}
					{@render field("Scheduled", order.scheduledFor && formatDate(order.scheduledFor))}
					{@render field("Completed", order.completedAt && formatDate(order.completedAt))}
				</dl>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Customer</Card.Title>
				<Card.Description>{customer.code}</Card.Description>
				<Card.Action>
					<Badge variant="outline">{humanize(customer.segment)}</Badge>
				</Card.Action>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-2 gap-4">
					{@render field("Company", customer.name)}
					{@render field("Contact", customer.contactName)}
					{@render field("Email", customer.email, `mailto:${customer.email}`)}
					{@render field("Phone", customer.phone, `tel:${customer.phone}`)}
					{@render field("Location", `${customer.city}, ${customer.country}`)}
				</dl>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Equipment</Card.Title>
				{#if equipment}
					<Card.Description>{equipment.serialNumber}</Card.Description>
					<Card.Action>
						<EquipmentStatusBadge status={equipment.status} />
					</Card.Action>
				{/if}
			</Card.Header>
			<Card.Content>
				{#if equipment}
					<dl class="grid grid-cols-2 gap-4">
						{@render field("Model", `${equipment.manufacturer} ${equipment.model}`)}
						{@render field("Category", humanize(equipment.category))}
						{@render field("Installed", formatDate(equipment.installedAt))}
						{@render field(
							"Warranty",
							`${underWarranty ? "Covered" : "Expired"}, until ${formatDate(equipment.warrantyUntil)}`,
						)}
					</dl>
				{:else}
					<p class="text-sm text-muted-foreground">
						New installation; the unit isn't registered yet.
					</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Engineer</Card.Title>
				{#if engineer}
					<Card.Description>{engineer.region} region</Card.Description>
					<Card.Action>
						<Badge variant="outline">{humanize(engineer.specialty)}</Badge>
					</Card.Action>
				{/if}
			</Card.Header>
			<Card.Content>
				{#if engineer}
					<dl class="grid grid-cols-2 gap-4">
						{@render field("Name", engineer.name)}
						{@render field("Hourly rate", formatCents(engineer.hourlyRate))}
						{@render field("Email", engineer.email, `mailto:${engineer.email}`)}
						{@render field("Phone", engineer.phone, `tel:${engineer.phone}`)}
					</dl>
				{:else}
					<p class="text-sm text-muted-foreground">No engineer assigned yet.</p>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</div>
