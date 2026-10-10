<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import PencilIcon from "@lucide/svelte/icons/pencil";

	import ActivityCard from "#lib/components/activity/activity-card.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import EquipmentStatusBadge from "#lib/equipment/status-badge.svelte";
	import { formatCents, formatDate, label } from "#lib/i18n";
	import OrderLink from "#lib/orders/order-link.svelte";
	import OrderStatusBadge from "#lib/orders/status-badge.svelte";
	import TypeLabel from "#lib/orders/type-label.svelte";

	import { formatTerm, levels } from "../../../../display.ts";
	import LevelBadge from "../../../../level-badge.svelte";
	import { contractStatus } from "../../../../model.ts";
	import ContractStatusBadge from "../../../../status-badge.svelte";
	import { deleteContract, getContract } from "../contracts.remote.ts";

	let { params }: { params: RouteParams<"/(app)/(modules)/contracts/[number]"> } = $props();

	const data = $derived(await getContract(params.number));

	const contract = $derived(data.contract);
	const { customer, equipment } = $derived(data.contract);
	const status = $derived(contractStatus(contract));
</script>

<svelte:head>
	<title>{m.contracts_head_title({ title: contract.number })}</title>
</svelte:head>

<PageHeader
	title={contract.number}
	description={m.contracts_detail_description({
		level: levels[contract.level].label,
		customer: customer.name,
	})}
	breadcrumbs={[
		{ label: m.contracts_title(), href: resolve("/(app)/(modules)/contracts") },
		{ label: contract.number },
	]}
>
	{#snippet badges()}
		<ContractStatusBadge {status} />
		<LevelBadge level={contract.level} />
	{/snippet}
	{#snippet actions()}
		<Button
			variant="outline"
			href={resolve("/(app)/(modules)/contracts/[number]/edit", { number: contract.number })}
		>
			<PencilIcon data-icon="inline-start" />
			{m.common_edit()}
		</Button>
		<DeleteDialog
			form={deleteContract}
			id={String(contract.id)}
			title={m.contracts_delete_title({ number: contract.number })}
			description={m.contracts_delete_description()}
		/>
	{/snippet}
</PageHeader>

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="flex min-w-0 flex-col gap-6 lg:col-span-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.contracts_form_covered()}</Card.Title>
				<Card.Description>
					{m.contracts_covered_units({ count: equipment.length, customer: customer.name })}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if equipment.length}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{m.contracts_serial_number()}</Table.Head>
								<Table.Head>{m.contracts_equipment()}</Table.Head>
								<Table.Head>{m.contracts_category()}</Table.Head>
								<Table.Head>{m.contracts_status()}</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each equipment as unit (unit.id)}
								<Table.Row>
									<Table.Cell>
										<a
											href={resolve("/(app)/equipment/[serial]", { serial: unit.serialNumber })}
											class="font-medium whitespace-nowrap underline-offset-4 hover:underline"
										>
											{unit.serialNumber}
										</a>
									</Table.Cell>
									<Table.Cell>{unit.manufacturer} {unit.model}</Table.Cell>
									<Table.Cell>{label("equipmentCategory", unit.category)}</Table.Cell>
									<Table.Cell><EquipmentStatusBadge status={unit.status} /></Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{:else}
					<Empty.Root class="p-6">
						<Empty.Header>
							<Empty.Title>{m.contracts_no_equipment_title()}</Empty.Title>
							<Empty.Description>{m.contracts_no_equipment_description()}</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.contracts_orders()}</Card.Title>
				<Card.Description>
					{m.contracts_orders_description({
						from: formatDate(contract.startsOn),
						until: formatDate(contract.endsOn),
					})}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if data.orders.length}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{m.contracts_order()}</Table.Head>
								<Table.Head>{m.contracts_equipment()}</Table.Head>
								<Table.Head>{m.contracts_type()}</Table.Head>
								<Table.Head>{m.contracts_status()}</Table.Head>
								<Table.Head class="text-right">{m.contracts_created()}</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.orders as order (order.id)}
								<Table.Row>
									<Table.Cell><OrderLink number={order.number} /></Table.Cell>
									<Table.Cell class="text-muted-foreground">{order.serialNumber}</Table.Cell>
									<Table.Cell><TypeLabel type={order.type} /></Table.Cell>
									<Table.Cell><OrderStatusBadge status={order.status} /></Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										{formatDate(order.createdAt)}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{:else}
					<Empty.Root class="p-6">
						<Empty.Header>
							<Empty.Title>{m.contracts_no_orders_title()}</Empty.Title>
							<Empty.Description>
								{status === "upcoming"
									? m.contracts_no_orders_upcoming()
									: m.contracts_no_orders_description()}
							</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<div class="flex min-w-0 flex-col gap-6">
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.contracts_terms()}</Card.Title>
				<Card.Description>{formatTerm(contract.startsOn, contract.endsOn)}</Card.Description>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-2 gap-4">
					<DetailItem label={m.contracts_starts_on()} value={formatDate(contract.startsOn)} />
					<DetailItem label={m.contracts_ends_on()} value={formatDate(contract.endsOn)} />
					<DetailItem label={m.contracts_monthly_fee()} value={formatCents(contract.monthlyFee)} />
					<DetailItem
						label={m.contracts_yearly_fee()}
						value={formatCents(contract.monthlyFee * 12)}
					/>
					<DetailItem
						label={m.contracts_response_time()}
						value={m.contracts_within_hours({ count: contract.responseHours })}
					/>
					<DetailItem label={m.contracts_created()} value={formatDate(contract.createdAt)} />
					<div class="col-span-2">
						<DetailItem label={m.contracts_notes()} value={contract.notes} />
					</div>
				</dl>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.contracts_customer()}</Card.Title>
				<Card.Description>{customer.code}</Card.Description>
				<Card.Action>
					<Badge variant="outline">{label("customerSegment", customer.segment)}</Badge>
				</Card.Action>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-2 gap-4">
					<DetailItem
						label={m.contracts_company()}
						value={customer.name}
						href={resolve("/(app)/customers/[code]", { code: customer.code })}
					/>
					<DetailItem label={m.contracts_contact()} value={customer.contactName} />
					<DetailItem
						label={m.contracts_email()}
						value={customer.email}
						href={`mailto:${customer.email}`}
					/>
					<DetailItem
						label={m.contracts_phone()}
						value={customer.phone}
						href={`tel:${customer.phone}`}
					/>
					<DetailItem
						label={m.contracts_location()}
						value={`${customer.city}, ${customer.country}`}
					/>
				</dl>
			</Card.Content>
		</Card.Root>

		<ActivityCard type="contract" id={contract.id} />
	</div>
</div>
