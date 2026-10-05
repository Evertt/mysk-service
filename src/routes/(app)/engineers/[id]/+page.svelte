<script lang="ts">
	import { resolve } from "$app/paths";
	import PencilIcon from "@lucide/svelte/icons/pencil";

	import CustomerLink from "#lib/components/customers/customer-link.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import ActiveBadge from "#lib/components/engineers/active-badge.svelte";
	import SpecialtyBadge from "#lib/components/engineers/specialty-badge.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import OrderLink from "#lib/components/orders/order-link.svelte";
	import StatusBadge from "#lib/components/orders/status-badge.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatCents, formatDate } from "#lib/format.js";

	import { deleteEngineer, getEngineer } from "../engineers.remote.js";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getEngineer(params.id));
	const engineer = $derived(data.engineer);

	type OrderRow = (typeof data.openOrders)[number];

	const hours = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
</script>

<svelte:head>
	<title>{engineer.name} · Engineers</title>
</svelte:head>

{#snippet orders(rows: OrderRow[], dateLabel: string, date: (row: OrderRow) => Date | null)}
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Order</Table.Head>
				<Table.Head>Customer</Table.Head>
				<Table.Head>Status</Table.Head>
				<Table.Head class="text-right">{dateLabel}</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each rows as row (row.id)}
				{@const value = date(row)}
				<Table.Row>
					<Table.Cell>
						<div class="flex max-w-56 flex-col">
							<OrderLink number={row.number} />
							<span class="truncate text-xs text-muted-foreground">{row.description}</span>
						</div>
					</Table.Cell>
					<Table.Cell>
						<CustomerLink code={row.customer.code} name={row.customer.name} withCode />
					</Table.Cell>
					<Table.Cell><StatusBadge status={row.status} /></Table.Cell>
					<Table.Cell class="text-right tabular-nums">
						{#if value}
							{formatDate(value)}
						{:else}
							<span class="text-muted-foreground">Not scheduled</span>
						{/if}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
{/snippet}

<PageHeader title={engineer.name} description="{engineer.region} region">
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/engineers")}>Engineers</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{engineer.name}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
	{#snippet badges()}
		<ActiveBadge active={engineer.active} />
		<SpecialtyBadge specialty={engineer.specialty} />
	{/snippet}
	{#snippet actions()}
		<Button
			variant="outline"
			href={resolve("/(app)/engineers/[id]/edit", { id: String(engineer.id) })}
		>
			<PencilIcon data-icon="inline-start" />
			Edit
		</Button>
		<DeleteDialog
			form={deleteEngineer}
			id={String(engineer.id)}
			title="Delete {engineer.name}?"
			description="The engineer is removed permanently."
		/>
	{/snippet}
</PageHeader>

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="flex min-w-0 flex-col gap-6 lg:col-span-2">
		<div class="grid gap-4 sm:grid-cols-3">
			<Card.Root>
				<Card.Header>
					<Card.Description>Open orders</Card.Description>
					<Card.Title class="text-2xl tabular-nums">{data.stats.openOrders}</Card.Title>
				</Card.Header>
			</Card.Root>
			<Card.Root>
				<Card.Header>
					<Card.Description>Hours booked, last 30 days</Card.Description>
					<Card.Title class="text-2xl tabular-nums">{hours.format(data.stats.hours)} h</Card.Title>
				</Card.Header>
			</Card.Root>
			<Card.Root>
				<Card.Header>
					<Card.Description>Labour revenue, last 30 days</Card.Description>
					<Card.Title class="text-2xl tabular-nums">{formatCents(data.stats.revenue)}</Card.Title>
				</Card.Header>
			</Card.Root>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Open orders</Card.Title>
				<Card.Description>Quoted, scheduled and in progress, soonest first.</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if data.openOrders.length}
					{@render orders(data.openOrders, "Scheduled", (row) => row.scheduledFor)}
				{:else}
					<Empty.Root class="p-6">
						<Empty.Header>
							<Empty.Title>No open orders</Empty.Title>
							<Empty.Description>{engineer.name} has nothing planned.</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Recent work</Card.Title>
				<Card.Description>The last 10 orders they completed.</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if data.completedOrders.length}
					{@render orders(data.completedOrders, "Completed", (row) => row.completedAt)}
				{:else}
					<Empty.Root class="p-6">
						<Empty.Header>
							<Empty.Title>No completed work</Empty.Title>
							<Empty.Description>Orders show up here once they're completed.</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<div class="flex min-w-0 flex-col gap-6">
		<Card.Root>
			<Card.Header>
				<Card.Title>Profile</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<!-- Full width, so email addresses don't wrap. -->
				<dl class="grid gap-4">
					<DetailItem label="Email" value={engineer.email} href={`mailto:${engineer.email}`} />
				</dl>
				<dl class="grid grid-cols-2 gap-4">
					<DetailItem label="Phone" value={engineer.phone} href={`tel:${engineer.phone}`} />
					<DetailItem label="Specialty">
						<SpecialtyBadge specialty={engineer.specialty} />
					</DetailItem>
					<DetailItem label="Region" value={engineer.region} />
					<DetailItem label="Hourly rate" value={formatCents(engineer.hourlyRate)} />
					<DetailItem label="Hired" value={formatDate(engineer.hiredAt)} />
					<DetailItem label="Status">
						<ActiveBadge active={engineer.active} />
					</DetailItem>
				</dl>
			</Card.Content>
		</Card.Root>
	</div>
</div>
