<script lang="ts">
	import { resolve } from "$app/paths";
	import PencilIcon from "@lucide/svelte/icons/pencil";

	import ActivityCard from "#lib/components/activity/activity-card.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import StatCard from "#lib/components/stat-card.svelte";
	import { countryName } from "#lib/customers";
	import { SegmentBadge } from "#lib/customers/components";
	import { StatusBadge as EquipmentStatusBadge } from "#lib/equipment/components";
	import { formatCents, formatDate, formatNumber, label } from "#lib/i18n";

	import { deleteCustomer, getCustomer } from "../customers.remote.ts";
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
	const location = $derived(`${customer.city}, ${countryName(customer.country)}`);
</script>

<svelte:head>
	<title>{customer.name} · {m.customers_title()}</title>
</svelte:head>

<PageHeader
	title={customer.name}
	description="{customer.code} · {location}"
	breadcrumbs={[
		{ label: m.customers_title(), href: resolve("/(app)/customers") },
		{ label: customer.name },
	]}
>
	{#snippet badges()}
		<SegmentBadge segment={customer.segment} />
	{/snippet}
	{#snippet actions()}
		<Button
			variant="outline"
			href={resolve("/(app)/customers/[code]/edit", { code: customer.code })}
		>
			<PencilIcon data-icon="inline-start" />
			{m.common_edit()}
		</Button>
		<DeleteDialog
			form={deleteCustomer}
			id={String(customer.id)}
			title={m.customers_delete_title({ name: customer.name })}
			description={m.customers_delete_description()}
		/>
	{/snippet}
</PageHeader>

<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
	<StatCard
		label={m.customers_column_open_orders()}
		value={formatNumber(stats.openOrders)}
		detail={m.customers_stats_orders_total({ count: stats.orders })}
	/>
	<StatCard
		label={m.customers_stats_revenue()}
		value={formatCents(stats.revenue)}
		detail={m.customers_stats_revenue_orders({ count: stats.revenueOrders })}
	/>
	<StatCard
		label={m.customers_column_equipment()}
		value={formatNumber(customer.equipment.length)}
		detail={needsAttention
			? m.customers_stats_attention({ count: needsAttention })
			: m.customers_stats_all_working()}
	/>
	<StatCard
		label={m.customers_column_since()}
		value={String(customer.createdAt.getFullYear())}
		detail={stats.lastOrderAt
			? m.customers_stats_last_order({ date: formatDate(stats.lastOrderAt) })
			: m.customers_stats_no_orders()}
	/>
</div>

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="flex min-w-0 flex-col gap-6 lg:col-span-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.customers_column_equipment()}</Card.Title>
				<Card.Description>
					{m.customers_equipment_description({ name: customer.name })}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if customer.equipment.length}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{m.customers_equipment_column_model()}</Table.Head>
								<Table.Head>{m.customers_equipment_column_category()}</Table.Head>
								<Table.Head>{m.customers_equipment_column_installed()}</Table.Head>
								<Table.Head>{m.customers_equipment_column_status()}</Table.Head>
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
									<Table.Cell>{label("equipmentCategory", unit.category)}</Table.Cell>
									<Table.Cell class="tabular-nums">{formatDate(unit.installedAt)}</Table.Cell>
									<Table.Cell><EquipmentStatusBadge status={unit.status} /></Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{:else}
					<Empty.Root class="p-6">
						<Empty.Header>
							<Empty.Title>{m.customers_equipment_empty_title()}</Empty.Title>
							<Empty.Description>{m.customers_equipment_empty_description()}</Empty.Description>
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
				<Card.Title>{m.customers_column_contact()}</Card.Title>
				<Card.Description>{customer.code}</Card.Description>
			</Card.Header>
			<Card.Content>
				<!-- One column for the contact details, so email addresses don't wrap. -->
				<dl class="grid gap-4">
					<DetailItem label={m.customers_field_contact_name()} value={customer.contactName} />
					<DetailItem
						label={m.customers_field_email()}
						value={customer.email}
						href={`mailto:${customer.email}`}
					/>
					<DetailItem
						label={m.customers_field_phone()}
						value={customer.phone}
						href={`tel:${customer.phone}`}
					/>
					<DetailItem label={m.customers_column_location()} value={location} />
					<DetailItem label={m.customers_column_since()} value={formatDate(customer.createdAt)} />
				</dl>
			</Card.Content>
		</Card.Root>

		<ActivityCard type="customer" id={customer.id} />
	</div>
</div>
