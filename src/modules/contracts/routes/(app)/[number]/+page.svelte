<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";

	import DetailItem from "#lib/components/detail-item.svelte";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import RecordPage from "#lib/components/record-page.svelte";
	import { CustomerCard } from "#lib/customers/components.ts";
	import { EquipmentLink } from "#lib/equipment/components.ts";
	import { equipmentStatusDisplay } from "#lib/equipment/index.ts";
	import { formatCents, formatDate } from "#lib/i18n/index.ts";
	import { OrderLink, TypeLabel } from "#lib/orders/components.ts";
	import { unitsSummary, orderStatusDisplay } from "#lib/orders/index.ts";
	import { points } from "#modules/contracts/api/extensions.ts";
	import { deleteContract, getContract } from "#modules/contracts/contracts.remote.ts";
	import {
		formatTerm,
		contractLevelDisplay,
		contractStatusDisplay,
	} from "#modules/contracts/display.ts";
	import { contractStatus } from "#modules/contracts/model.ts";

	let { params }: { params: RouteParams<"/(app)/(modules)/contracts/[number]"> } = $props();

	const data = $derived(await getContract(params.number));

	const contract = $derived(data.contract);
	const { customer, equipment } = $derived(data.contract);
	const status = $derived(contractStatus(contract));
</script>

<RecordPage
	title={contract.number}
	subtitle={m.contracts_detail_description({
		level: contractLevelDisplay[contract.level].label,
		customer: customer.name,
	})}
	list={{ label: m.contracts_title(), href: resolve("/(app)/(modules)/contracts") }}
	edit={resolve("/(app)/(modules)/contracts/[number]/edit", { number: contract.number })}
	remove={{
		form: deleteContract,
		id: String(contract.id),
		title: m.contracts_delete_title({ number: contract.number }),
		description: m.contracts_delete_description(),
	}}
	subject={{ type: "contract", id: contract.id }}
	slots={points.detail}
	slotProps={{ number: contract.number, equipmentIds: equipment.map((unit) => unit.id) }}
>
	{#snippet badges()}
		<EnumBadge display={contractStatusDisplay} value={status} />
		<EnumBadge display={contractLevelDisplay} value={contract.level} />
	{/snippet}
	{#snippet main()}
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
										<EquipmentLink serialNumber={unit.serialNumber} />
									</Table.Cell>
									<Table.Cell>{unit.manufacturer} {unit.model}</Table.Cell>
									<Table.Cell>{unit.category.name}</Table.Cell>
									<Table.Cell
										><EnumBadge display={equipmentStatusDisplay} value={unit.status} /></Table.Cell
									>
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
									<Table.Cell class="text-muted-foreground">
										{unitsSummary(order.unit, order.unitCount)}
									</Table.Cell>
									<Table.Cell><TypeLabel type={order.type} /></Table.Cell>
									<Table.Cell
										><EnumBadge display={orderStatusDisplay} value={order.status} /></Table.Cell
									>
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
	{/snippet}
	{#snippet side()}
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

		<CustomerCard {customer} title={m.contracts_customer()} />
	{/snippet}
</RecordPage>
