<script lang="ts">
	import { resolve } from "$app/paths";
	import PencilIcon from "@lucide/svelte/icons/pencil";

	import ActivityCard from "#lib/components/activity/activity-card.svelte";
	import CustomerSegmentBadge from "#lib/components/customers/segment-badge.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import SpecialtyBadge from "#lib/components/engineers/specialty-badge.svelte";
	import CategoryLabel from "#lib/components/equipment/category-label.svelte";
	import EquipmentLink from "#lib/components/equipment/equipment-link.svelte";
	import EquipmentStatusBadge from "#lib/components/equipment/status-badge.svelte";
	import WarrantyBadge from "#lib/components/equipment/warranty-badge.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import { formatQuantity } from "#lib/components/materials/display.js";
	import MaterialLink from "#lib/components/materials/material-link.svelte";
	import OrderLink from "#lib/components/orders/order-link.svelte";
	import PriorityBadge from "#lib/components/orders/priority-badge.svelte";
	import StatusBadge from "#lib/components/orders/status-badge.svelte";
	import TypeLabel from "#lib/components/orders/type-label.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatCents, formatDate } from "#lib/format.js";
	import { isEditableOrder } from "#lib/models.js";

	import ModuleSlots from "../../module-slots.svelte";
	import OrderTags from "../order-tags.svelte";
	import { deleteOrder, getOrder } from "../orders.remote.js";
	import type { PageProps } from "./$types";
	import WorkReport from "./work-report.svelte";

	let { params }: PageProps = $props();

	const data = $derived(await getOrder(params.number));

	const order = $derived(data.order);
	const { customer, equipment, engineer } = $derived(data.order);
</script>

<svelte:head>
	<title>{m.orders_page_title({ number: order.number })}</title>
</svelte:head>

<PageHeader title={order.number} description={order.description}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/orders")}>{m.orders_title()}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{order.number}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
	{#snippet badges()}
		<StatusBadge status={order.status} />
		<OrderTags tags={data.tags} />
		<PriorityBadge priority={order.priority} />
		<TypeLabel type={order.type} />
	{/snippet}
	{#snippet actions()}
		<!-- An invoiced order stays as it was invoiced. -->
		{#if isEditableOrder(order.status)}
			<Button
				variant="outline"
				href={resolve("/(app)/orders/[number]/edit", { number: order.number })}
			>
				<PencilIcon data-icon="inline-start" />
				{m.common_edit()}
			</Button>
			<DeleteDialog
				form={deleteOrder}
				id={String(order.id)}
				title={m.orders_delete_title({ number: order.number })}
				description={m.orders_delete_description()}
			/>
		{/if}
	{/snippet}
</PageHeader>

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="flex min-w-0 flex-col gap-6 lg:col-span-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.orders_materials_labour()}</Card.Title>
				<Card.Description>{m.orders_materials_labour_description()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.orders_line_material()}</Table.Head>
							<Table.Head class="text-right">{m.orders_line_quantity()}</Table.Head>
							<Table.Head class="text-right">{m.orders_line_unit_price()}</Table.Head>
							<Table.Head class="text-right">{m.orders_line_amount()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each order.lines as line (line.id)}
							<Table.Row>
								<Table.Cell>
									<MaterialLink sku={line.material.sku} name={line.material.name} />
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{formatQuantity(line.quantity, line.material.unit)}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{formatCents(line.unitPrice)}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{formatCents(line.total)}</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={4} class="text-center text-muted-foreground">
									{m.orders_no_materials()}
								</Table.Cell>
							</Table.Row>
						{/each}
						<Table.Row>
							<Table.Cell>
								<div class="flex flex-col">
									<span>{m.orders_labour()}</span>
									<span class="text-xs text-muted-foreground">
										{engineer
											? m.orders_labour_rate({ name: engineer.name })
											: m.orders_labour_standard_rate()}
									</span>
								</div>
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">
								{m.common_count_hours_short({ count: order.laborHours })}
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">
								{formatCents(data.totals.laborRate)}
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">
								{formatCents(data.totals.labor)}
							</Table.Cell>
						</Table.Row>
						{#each data.totals.adjustments as adjustment, i (i)}
							<Table.Row>
								<Table.Cell colspan={3}>
									<div class="flex flex-col">
										<span>{adjustment.label}</span>
										{#if adjustment.detail}
											<span class="text-xs text-muted-foreground">{adjustment.detail}</span>
										{/if}
									</div>
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{formatCents(adjustment.amount)}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
					<Table.Footer>
						<Table.Row>
							<Table.Cell colspan={3}>{m.orders_column_total()}</Table.Cell>
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
					<Card.Title>{m.orders_history()}</Card.Title>
					<Card.Description>
						{m.orders_history_description({ serial: equipment.serialNumber })}
					</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if data.history.length}
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head>{m.orders_column_order()}</Table.Head>
									<Table.Head>{m.orders_column_type()}</Table.Head>
									<Table.Head>{m.orders_column_status()}</Table.Head>
									<Table.Head class="text-right">{m.orders_column_created()}</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each data.history as other (other.id)}
									<Table.Row>
										<Table.Cell>
											<OrderLink number={other.number} />
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
								<Empty.Title>{m.orders_history_empty_title()}</Empty.Title>
								<Empty.Description>{m.orders_history_empty_description()}</Empty.Description>
							</Empty.Header>
						</Empty.Root>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}
	</div>

	<div class="flex min-w-0 flex-col gap-6">
		<ModuleSlots name="order" props={{ number: order.number }} />

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.orders_schedule()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-3 gap-4">
					<DetailItem label={m.orders_column_created()} value={formatDate(order.createdAt)} />
					<DetailItem
						label={m.orders_column_scheduled()}
						value={order.scheduledFor && formatDate(order.scheduledFor)}
					/>
					<DetailItem
						label={m.orders_column_completed()}
						value={order.completedAt && formatDate(order.completedAt)}
					/>
				</dl>
			</Card.Content>
		</Card.Root>

		<WorkReport number={order.number} />

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.orders_customer()}</Card.Title>
				<Card.Description>{customer.code}</Card.Description>
				<Card.Action>
					<CustomerSegmentBadge segment={customer.segment} />
				</Card.Action>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-2 gap-4">
					<DetailItem
						label={m.orders_detail_company()}
						value={customer.name}
						href={resolve("/(app)/customers/[code]", { code: customer.code })}
					/>
					<DetailItem label={m.orders_detail_contact()} value={customer.contactName} />
					<DetailItem
						label={m.orders_detail_email()}
						value={customer.email}
						href={`mailto:${customer.email}`}
					/>
					<DetailItem
						label={m.orders_detail_phone()}
						value={customer.phone}
						href={`tel:${customer.phone}`}
					/>
					<DetailItem
						label={m.orders_detail_location()}
						value={`${customer.city}, ${customer.country}`}
					/>
				</dl>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.orders_equipment()}</Card.Title>
				{#if equipment}
					<Card.Description>
						<EquipmentLink serialNumber={equipment.serialNumber} />
					</Card.Description>
					<Card.Action>
						<EquipmentStatusBadge status={equipment.status} />
					</Card.Action>
				{/if}
			</Card.Header>
			<Card.Content>
				{#if equipment}
					<dl class="grid grid-cols-2 gap-4">
						<DetailItem
							label={m.orders_detail_model()}
							value={`${equipment.manufacturer} ${equipment.model}`}
						/>
						<DetailItem label={m.orders_detail_category()}>
							<CategoryLabel category={equipment.category} />
						</DetailItem>
						<DetailItem
							label={m.orders_detail_installed()}
							value={formatDate(equipment.installedAt)}
						/>
						<DetailItem label={m.orders_detail_warranty()}>
							<span class="flex flex-wrap items-center gap-2">
								{formatDate(equipment.warrantyUntil)}
								<WarrantyBadge until={equipment.warrantyUntil} at={order.createdAt} />
							</span>
						</DetailItem>
					</dl>
				{:else}
					<p class="text-sm text-muted-foreground">{m.orders_equipment_unregistered()}</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.orders_engineer()}</Card.Title>
				{#if engineer}
					<Card.Description
						>{m.orders_engineer_region({ region: engineer.region })}</Card.Description
					>
					<Card.Action>
						<SpecialtyBadge specialty={engineer.specialty} />
					</Card.Action>
				{/if}
			</Card.Header>
			<Card.Content>
				{#if engineer}
					<dl class="grid grid-cols-2 gap-4">
						<DetailItem
							label={m.orders_detail_name()}
							value={engineer.name}
							href={resolve("/(app)/engineers/[id]", { id: String(engineer.id) })}
						/>
						<DetailItem
							label={m.orders_detail_hourly_rate()}
							value={formatCents(engineer.hourlyRate)}
						/>
						<DetailItem
							label={m.orders_detail_email()}
							value={engineer.email}
							href={`mailto:${engineer.email}`}
						/>
						<DetailItem
							label={m.orders_detail_phone()}
							value={engineer.phone}
							href={`tel:${engineer.phone}`}
						/>
					</dl>
				{:else}
					<p class="text-sm text-muted-foreground">{m.orders_no_engineer()}</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<ActivityCard type="order" id={order.id} />
	</div>
</div>
