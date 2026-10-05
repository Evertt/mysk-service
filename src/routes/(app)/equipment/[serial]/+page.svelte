<script lang="ts">
	import { resolve } from "$app/paths";
	import PencilIcon from "@lucide/svelte/icons/pencil";

	import DetailItem from "#lib/components/detail-item.svelte";
	import CategoryLabel from "#lib/components/equipment/category-label.svelte";
	import { categories } from "#lib/components/equipment/display.js";
	import EquipmentStatusBadge from "#lib/components/equipment/status-badge.svelte";
	import WarrantyBadge from "#lib/components/equipment/warranty-badge.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import OrderLink from "#lib/components/orders/order-link.svelte";
	import OrderStatusBadge from "#lib/components/orders/status-badge.svelte";
	import TypeLabel from "#lib/components/orders/type-label.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatCents, formatDate, humanize } from "#lib/format.js";

	import { deleteEquipment, getEquipment } from "../equipment.remote.js";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getEquipment(params.serial));

	const unit = $derived(data.unit);
	const owner = $derived(data.unit.customer);
	const name = $derived(`${unit.manufacturer} ${unit.model}`);
</script>

<svelte:head>
	<title>{unit.serialNumber} · Equipment</title>
</svelte:head>

<PageHeader title={name} description="{categories[unit.category].label} · {unit.serialNumber}">
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/equipment")}>Equipment</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{unit.serialNumber}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
	{#snippet badges()}
		<EquipmentStatusBadge status={unit.status} />
		<WarrantyBadge until={unit.warrantyUntil} />
	{/snippet}
	{#snippet actions()}
		<Button
			variant="outline"
			href={resolve("/(app)/equipment/[serial]/edit", { serial: unit.serialNumber })}
		>
			<PencilIcon data-icon="inline-start" />
			Edit
		</Button>
		<DeleteDialog
			form={deleteEquipment}
			id={String(unit.id)}
			title="Delete {unit.serialNumber}?"
			description="The unit is removed permanently. Units with orders can't be deleted; decommission them instead."
		/>
	{/snippet}
</PageHeader>

<div class="grid gap-4 sm:grid-cols-3">
	<Card.Root>
		<Card.Header>
			<Card.Description>Open orders</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{data.openOrders}</Card.Title>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">
			Quoted, scheduled or in progress
		</Card.Footer>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>Last service</Card.Description>
			<Card.Title class="text-3xl tabular-nums">
				{data.lastService ? formatDate(data.lastService) : "Never"}
			</Card.Title>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">Latest completed order</Card.Footer>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>Orders</Card.Description>
			<Card.Title class="text-3xl tabular-nums">{data.history.length}</Card.Title>
		</Card.Header>
		<Card.Footer class="text-sm text-muted-foreground">
			Since installation on {formatDate(unit.installedAt)}
		</Card.Footer>
	</Card.Root>
</div>

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="flex min-w-0 flex-col gap-6 lg:col-span-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Service history</Card.Title>
				<Card.Description>All orders on this unit, most recent first.</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if data.history.length}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Order</Table.Head>
								<Table.Head>Type</Table.Head>
								<Table.Head>Status</Table.Head>
								<Table.Head>Created</Table.Head>
								<Table.Head class="text-right">Total</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.history as order (order.id)}
								<Table.Row>
									<Table.Cell><OrderLink number={order.number} /></Table.Cell>
									<Table.Cell><TypeLabel type={order.type} /></Table.Cell>
									<Table.Cell><OrderStatusBadge status={order.status} /></Table.Cell>
									<Table.Cell class="tabular-nums">{formatDate(order.createdAt)}</Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										{formatCents(order.total)}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{:else}
					<Empty.Root class="p-6">
						<Empty.Header>
							<Empty.Title>No orders yet</Empty.Title>
							<Empty.Description>This unit hasn't been serviced.</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<div class="flex min-w-0 flex-col gap-6">
		<Card.Root>
			<Card.Header>
				<Card.Title>Specifications</Card.Title>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-2 gap-4">
					<DetailItem label="Manufacturer" value={unit.manufacturer} />
					<DetailItem label="Model" value={unit.model} />
					<DetailItem label="Serial number" value={unit.serialNumber} />
					<DetailItem label="Category">
						<CategoryLabel category={unit.category} />
					</DetailItem>
					<DetailItem label="Installed" value={formatDate(unit.installedAt)} />
					<DetailItem label="Warranty until">
						<span class="flex flex-wrap items-center gap-2">
							{formatDate(unit.warrantyUntil)}
							<WarrantyBadge until={unit.warrantyUntil} />
						</span>
					</DetailItem>
				</dl>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Owner</Card.Title>
				<Card.Description>{owner.code}</Card.Description>
				<Card.Action>
					<Badge variant="outline">{humanize(owner.segment)}</Badge>
				</Card.Action>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-2 gap-4">
					<DetailItem
						label="Company"
						value={owner.name}
						href={resolve("/(app)/customers/[code]", { code: owner.code })}
					/>
					<DetailItem label="Contact" value={owner.contactName} />
					<DetailItem label="Email" value={owner.email} href={`mailto:${owner.email}`} />
					<DetailItem label="Phone" value={owner.phone} href={`tel:${owner.phone}`} />
					<DetailItem label="Location" value={`${owner.city}, ${owner.country}`} />
				</dl>
			</Card.Content>
		</Card.Root>
	</div>
</div>
