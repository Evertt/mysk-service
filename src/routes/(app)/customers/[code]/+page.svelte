<script lang="ts">
	import { resolve } from "$app/paths";
	import PencilIcon from "@lucide/svelte/icons/pencil";

	import SegmentBadge from "#lib/components/customers/segment-badge.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import EquipmentStatusBadge from "#lib/components/equipment/status-badge.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatCents, formatDate, humanize } from "#lib/format.js";

	import { deleteCustomer, getCustomer } from "../customers.remote.js";
	import type { PageProps } from "./$types";
	import RecentActivity from "./recent-activity.svelte";

	let { params }: PageProps = $props();

	const data = $derived(await getCustomer(params.code));

	const customer = $derived(data.customer);
	const stats = $derived(data.stats);
	const needsAttention = $derived(
		customer.equipment.filter(
			(unit) => unit.status === "needs_service" || unit.status === "out_of_service",
		).length,
	);
</script>

<svelte:head>
	<title>{customer.name} · Customers</title>
</svelte:head>

<PageHeader
	title={customer.name}
	description="{customer.code} · {customer.city}, {customer.country}"
>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/customers")}>Customers</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{customer.name}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
	{#snippet badges()}
		<SegmentBadge segment={customer.segment} />
	{/snippet}
	{#snippet actions()}
		<Button
			variant="outline"
			href={resolve("/(app)/customers/[code]/edit", { code: customer.code })}
		>
			<PencilIcon data-icon="inline-start" />
			Edit
		</Button>
		<DeleteDialog
			form={deleteCustomer}
			id={String(customer.id)}
			title="Delete {customer.name}?"
			description="The customer is removed permanently. Customers with equipment or orders can't be deleted."
		/>
	{/snippet}
</PageHeader>

<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
	<Card.Root>
		<Card.Header>
			<Card.Description>Open orders</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{stats.openOrders}</Card.Title>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">
			Of {customer.orders.length} orders in total
		</Card.Footer>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>Lifetime revenue</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{formatCents(stats.revenue)}</Card.Title>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">
			From {stats.revenueOrders} completed or invoiced orders
		</Card.Footer>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>Equipment</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{customer.equipment.length}</Card.Title>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">
			{needsAttention ? `${needsAttention} needing attention` : "All in working order"}
		</Card.Footer>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>Customer since</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{customer.createdAt.getFullYear()}</Card.Title>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">
			{stats.lastOrderAt ? `Last order on ${formatDate(stats.lastOrderAt)}` : "No orders yet"}
		</Card.Footer>
	</Card.Root>
</div>

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="flex min-w-0 flex-col gap-6 lg:col-span-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Equipment</Card.Title>
				<Card.Description>Units installed at {customer.name}.</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if customer.equipment.length}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Model</Table.Head>
								<Table.Head>Category</Table.Head>
								<Table.Head>Installed</Table.Head>
								<Table.Head>Status</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each customer.equipment as unit (unit.id)}
								<Table.Row>
									<Table.Cell>
										<div class="flex flex-col">
											<a
												href={resolve("/(app)/equipment/[serial]", { serial: unit.serialNumber })}
												class="font-medium underline-offset-4 hover:underline"
											>
												{unit.manufacturer}
												{unit.model}
											</a>
											<span class="text-xs text-muted-foreground">{unit.serialNumber}</span>
										</div>
									</Table.Cell>
									<Table.Cell>{humanize(unit.category)}</Table.Cell>
									<Table.Cell class="tabular-nums">{formatDate(unit.installedAt)}</Table.Cell>
									<Table.Cell><EquipmentStatusBadge status={unit.status} /></Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{:else}
					<Empty.Root class="p-6">
						<Empty.Header>
							<Empty.Title>No equipment</Empty.Title>
							<Empty.Description>No units are registered for this customer yet.</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>

		<RecentActivity code={customer.code} />
	</div>

	<div class="flex min-w-0 flex-col gap-6">
		<Card.Root>
			<Card.Header>
				<Card.Title>Contact</Card.Title>
				<Card.Description>{customer.code}</Card.Description>
			</Card.Header>
			<Card.Content>
				<!-- One column for the contact details, so email addresses don't wrap. -->
				<dl class="grid gap-4">
					<DetailItem label="Contact person" value={customer.contactName} />
					<DetailItem label="Email" value={customer.email} href={`mailto:${customer.email}`} />
					<DetailItem label="Phone" value={customer.phone} href={`tel:${customer.phone}`} />
					<DetailItem label="Location" value="{customer.city}, {customer.country}" />
					<DetailItem label="Customer since" value={formatDate(customer.createdAt)} />
				</dl>
			</Card.Content>
		</Card.Root>
	</div>
</div>
