<script lang="ts">
	import { resolve } from "$app/paths";
	import PencilIcon from "@lucide/svelte/icons/pencil";

	import ActivityCard from "#lib/components/activity/activity-card.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import StatCard from "#lib/components/stat-card.svelte";
	import CustomerLink from "#lib/customers/customer-link.svelte";
	import ActiveBadge from "#lib/engineers/active-badge.svelte";
	import { regionLabel } from "#lib/engineers/display.ts";
	import SpecialtyBadge from "#lib/engineers/specialty-badge.svelte";
	import { formatCents, formatDate, formatNumber } from "#lib/format.ts";
	import OrderLink from "#lib/orders/order-link.svelte";
	import StatusBadge from "#lib/orders/status-badge.svelte";

	import { deleteEngineer, getEngineer } from "../engineers.remote.ts";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getEngineer(params.id));
	const engineer = $derived(data.engineer);

	type OrderRow = (typeof data.openOrders)[number];
</script>

<svelte:head>
	<title>{engineer.name} · {m.engineers_title()}</title>
</svelte:head>

{#snippet orders(rows: OrderRow[], dateLabel: string, date: (row: OrderRow) => Date | null)}
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>{m.engineers_orders_column_order()}</Table.Head>
				<Table.Head>{m.engineers_orders_column_customer()}</Table.Head>
				<Table.Head>{m.engineers_orders_column_status()}</Table.Head>
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
							<span class="text-muted-foreground">{m.engineers_orders_not_scheduled()}</span>
						{/if}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
{/snippet}

<PageHeader
	title={engineer.name}
	description={m.engineers_region_description({ region: regionLabel(engineer.region) })}
	breadcrumbs={[
		{ label: m.engineers_title(), href: resolve("/(app)/engineers") },
		{ label: engineer.name },
	]}
>
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
			{m.common_edit()}
		</Button>
		<DeleteDialog
			form={deleteEngineer}
			id={String(engineer.id)}
			title={m.engineers_delete_title({ name: engineer.name })}
			description={m.engineers_delete_description()}
		/>
	{/snippet}
</PageHeader>

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="flex min-w-0 flex-col gap-6 lg:col-span-2">
		<div class="grid gap-4 sm:grid-cols-3">
			<StatCard
				size="small"
				label={m.engineers_stats_open_orders()}
				value={formatNumber(data.stats.openOrders)}
			/>
			<StatCard
				size="small"
				label={m.engineers_stats_hours()}
				value={m.common_count_hours_short({ count: data.stats.hours })}
			/>
			<StatCard
				size="small"
				label={m.engineers_stats_revenue()}
				value={formatCents(data.stats.revenue)}
			/>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.engineers_open_title()}</Card.Title>
				<Card.Description>{m.engineers_open_description()}</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if data.openOrders.length}
					{@render orders(
						data.openOrders,
						m.engineers_orders_column_scheduled(),
						(row) => row.scheduledFor,
					)}
				{:else}
					<Empty.Root class="p-6">
						<Empty.Header>
							<Empty.Title>{m.engineers_open_empty_title()}</Empty.Title>
							<Empty.Description>
								{m.engineers_open_empty_description({ name: engineer.name })}
							</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.engineers_recent_title()}</Card.Title>
				<Card.Description>
					{m.engineers_recent_description({ count: formatNumber(10) })}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if data.completedOrders.length}
					{@render orders(
						data.completedOrders,
						m.engineers_orders_column_completed(),
						(row) => row.completedAt,
					)}
				{:else}
					<Empty.Root class="p-6">
						<Empty.Header>
							<Empty.Title>{m.engineers_recent_empty_title()}</Empty.Title>
							<Empty.Description>{m.engineers_recent_empty_description()}</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<div class="flex min-w-0 flex-col gap-6">
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.engineers_profile()}</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<!-- Full width, so email addresses don't wrap. -->
				<dl class="grid gap-4">
					<DetailItem
						label={m.engineers_field_email()}
						value={engineer.email}
						href={`mailto:${engineer.email}`}
					/>
				</dl>
				<dl class="grid grid-cols-2 gap-4">
					<DetailItem
						label={m.engineers_field_phone()}
						value={engineer.phone}
						href={`tel:${engineer.phone}`}
					/>
					<DetailItem label={m.engineers_field_specialty()}>
						<SpecialtyBadge specialty={engineer.specialty} />
					</DetailItem>
					<DetailItem label={m.engineers_field_region()} value={regionLabel(engineer.region)} />
					<DetailItem
						label={m.engineers_field_hourly_rate()}
						value={formatCents(engineer.hourlyRate)}
					/>
					<DetailItem label={m.engineers_column_hired()} value={formatDate(engineer.hiredAt)} />
					<DetailItem label={m.engineers_column_status()}>
						<ActiveBadge active={engineer.active} />
					</DetailItem>
				</dl>
			</Card.Content>
		</Card.Root>

		<ActivityCard type="engineer" id={engineer.id} />
	</div>
</div>
