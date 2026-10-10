<script lang="ts">
	import { resolve } from "$app/paths";
	import PencilIcon from "@lucide/svelte/icons/pencil";

	import ActivityCard from "#lib/components/activity/activity-card.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { CustomerCard } from "#lib/customers/components.ts";
	import { SpecialtyBadge } from "#lib/engineers/components.ts";
	import {
		CategoryLabel,
		EquipmentLink,
		StatusBadge as EquipmentStatusBadge,
		WarrantyBadge,
	} from "#lib/equipment/components.ts";
	import { formatCents, formatDate } from "#lib/i18n/index.ts";
	import { isEditableOrder } from "#lib/models.ts";
	import { PriorityBadge, StatusBadge, TypeLabel } from "#lib/orders/components.ts";
	import { detailSide } from "#lib/orders/extensions.ts";

	import ExtensionSlot from "../../extension-slot.svelte";
	import OrderTags from "../order-tags.svelte";
	import { deleteOrder, getOrder } from "../order.remote.ts";
	import type { PageProps } from "./$types";
	import EquipmentHistoryCard from "./equipment-history-card.svelte";
	import OrderLinesCard from "./order-lines-card.svelte";
	import WorkReport from "./work-report.svelte";

	let { params }: PageProps = $props();

	const data = $derived(await getOrder(params.number));

	const order = $derived(data.order);
	const { customer, equipment, engineer } = $derived(data.order);
</script>

<svelte:head>
	<title>{m.orders_page_title({ number: order.number })}</title>
</svelte:head>

<PageHeader
	title={order.number}
	description={order.description}
	breadcrumbs={[
		{ label: m.orders_title(), href: resolve("/(app)/orders") },
		{ label: order.number },
	]}
>
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
		<OrderLinesCard {order} totals={data.totals} />

		{#if equipment}
			<EquipmentHistoryCard serialNumber={equipment.serialNumber} history={data.history} />
		{/if}
	</div>

	<div class="flex min-w-0 flex-col gap-6">
		<ExtensionSlot point={detailSide} props={{ number: order.number }} />

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

		<CustomerCard {customer} title={m.orders_customer()} />

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
