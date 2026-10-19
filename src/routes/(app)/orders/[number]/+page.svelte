<script lang="ts">
	import { resolve } from "$app/paths";
	import PencilIcon from "@lucide/svelte/icons/pencil";

	import ActivityCard from "#lib/components/activity/activity-card.svelte";
	import ChangedElsewhere from "#lib/components/activity/changed-elsewhere.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { CustomerCard, SiteCard } from "#lib/customers/components.ts";
	import { EngineerLink, SpecialtyBadge } from "#lib/engineers/components.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { formatCents, formatDate } from "#lib/i18n/index.ts";
	import { PriorityBadge, StatusBadge, TypeLabel } from "#lib/orders/components.ts";
	import {
		AcceptanceCard,
		EquipmentHistoryCard,
		OrderLinesCard,
		OrderTags,
		UnitsCard,
		WorkReport,
	} from "#lib/orders/components.ts";
	import { detailSide } from "#lib/orders/extensions.ts";
	import { mayDeleteOrder, mayEditOrder } from "#lib/orders/index.ts";
	import { deleteOrder, getOrder, getOrderHistory } from "#lib/orders/remotes.ts";

	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getOrder(params.number));

	const order = $derived(data.order);
	const { customer, engineer } = $derived(data.order);
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
		<!-- An invoiced order stays as it was invoiced; one awaiting acceptance is accepted first. -->
		{#if mayEditOrder(order.status)}
			<Button
				variant="outline"
				href={resolve("/(app)/orders/[number]/edit", { number: order.number })}
			>
				<PencilIcon data-icon="inline-start" />
				{m.common_edit()}
			</Button>
		{/if}
		{#if mayDeleteOrder(order.status)}
			<DeleteDialog
				form={deleteOrder}
				id={String(order.id)}
				title={m.orders_delete_title({ number: order.number })}
				description={m.orders_delete_description()}
			/>
		{/if}
	{/snippet}
</PageHeader>

<ChangedElsewhere type="order" id={order.id} />

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="flex min-w-0 flex-col gap-6 lg:col-span-2">
		{#if data.request}
			<AcceptanceCard {order} request={data.request} />
		{/if}

		<OrderLinesCard {order} totals={data.totals} />

		<UnitsCard {order} />

		{#if order.units.length}
			<EquipmentHistoryCard units={order.units} history={await getOrderHistory(order.number)} />
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

		<WorkReport notes={data.notes} signoff={data.signoff} />

		<CustomerCard {customer} title={m.orders_customer()} />

		{#each data.sites as site (site.id)}
			<SiteCard {site} title={m.orders_site()} />
		{/each}

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
						<DetailItem label={m.orders_detail_name()}>
							<EngineerLink
								id={engineer.id}
								name={engineer.name}
								class="underline-offset-4 hover:underline"
							/>
						</DetailItem>
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
