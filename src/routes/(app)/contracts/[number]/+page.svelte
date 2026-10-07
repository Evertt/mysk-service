<script lang="ts">
	import { resolve } from "$app/paths";
	import PencilIcon from "@lucide/svelte/icons/pencil";

	import ActivityCard from "#lib/components/activity/activity-card.svelte";
	import { formatTerm, levels } from "#lib/components/contracts/display.js";
	import LevelBadge from "#lib/components/contracts/level-badge.svelte";
	import ContractStatusBadge from "#lib/components/contracts/status-badge.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import EquipmentStatusBadge from "#lib/components/equipment/status-badge.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import OrderLink from "#lib/components/orders/order-link.svelte";
	import OrderStatusBadge from "#lib/components/orders/status-badge.svelte";
	import TypeLabel from "#lib/components/orders/type-label.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatCents, formatDate } from "#lib/format.js";
	import { label } from "#lib/i18n/labels.js";
	import { contractStatus } from "#lib/models.js";

	import { deleteContract, getContract } from "../contracts.remote.js";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getContract(params.number));

	const contract = $derived(data.contract);
	const { customer, equipment } = $derived(data.contract);
	const status = $derived(contractStatus(contract));
</script>

<svelte:head>
	<title>{contract.number} · Service contracts</title>
</svelte:head>

<PageHeader
	title={contract.number}
	description="{levels[contract.level].label} service contract for {customer.name}"
>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/contracts")}>Service contracts</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{contract.number}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
	{#snippet badges()}
		<ContractStatusBadge {status} />
		<LevelBadge level={contract.level} />
	{/snippet}
	{#snippet actions()}
		<Button
			variant="outline"
			href={resolve("/(app)/contracts/[number]/edit", { number: contract.number })}
		>
			<PencilIcon data-icon="inline-start" />
			Edit
		</Button>
		<DeleteDialog
			form={deleteContract}
			id={String(contract.id)}
			title="Delete {contract.number}?"
			description="The contract is removed permanently. The equipment and its orders stay."
		/>
	{/snippet}
</PageHeader>

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="flex min-w-0 flex-col gap-6 lg:col-span-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Covered equipment</Card.Title>
				<Card.Description>
					{equipment.length}
					{equipment.length === 1 ? "unit" : "units"} of {customer.name}.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if equipment.length}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Serial number</Table.Head>
								<Table.Head>Equipment</Table.Head>
								<Table.Head>Category</Table.Head>
								<Table.Head>Status</Table.Head>
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
							<Empty.Title>No equipment covered</Empty.Title>
							<Empty.Description
								>The units this contract covered have been removed.</Empty.Description
							>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Orders under this contract</Card.Title>
				<Card.Description>
					Work on the covered equipment between {formatDate(contract.startsOn)} and
					{formatDate(contract.endsOn)}.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if data.orders.length}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Order</Table.Head>
								<Table.Head>Equipment</Table.Head>
								<Table.Head>Type</Table.Head>
								<Table.Head>Status</Table.Head>
								<Table.Head class="text-right">Created</Table.Head>
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
							<Empty.Title>No orders</Empty.Title>
							<Empty.Description>
								{status === "upcoming"
									? "The contract hasn't started yet."
									: "No work on the covered equipment during the contract."}
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
				<Card.Title>Terms</Card.Title>
				<Card.Description>{formatTerm(contract.startsOn, contract.endsOn)}</Card.Description>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-2 gap-4">
					<DetailItem label="Starts on" value={formatDate(contract.startsOn)} />
					<DetailItem label="Ends on" value={formatDate(contract.endsOn)} />
					<DetailItem label="Monthly fee" value={formatCents(contract.monthlyFee)} />
					<DetailItem label="Yearly fee" value={formatCents(contract.monthlyFee * 12)} />
					<DetailItem label="Response time" value="Within {contract.responseHours} hours" />
					<DetailItem label="Created" value={formatDate(contract.createdAt)} />
					<div class="col-span-2">
						<DetailItem label="Notes" value={contract.notes} />
					</div>
				</dl>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Customer</Card.Title>
				<Card.Description>{customer.code}</Card.Description>
				<Card.Action>
					<Badge variant="outline">{label("customerSegment", customer.segment)}</Badge>
				</Card.Action>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-2 gap-4">
					<DetailItem
						label="Company"
						value={customer.name}
						href={resolve("/(app)/customers/[code]", { code: customer.code })}
					/>
					<DetailItem label="Contact" value={customer.contactName} />
					<DetailItem label="Email" value={customer.email} href={`mailto:${customer.email}`} />
					<DetailItem label="Phone" value={customer.phone} href={`tel:${customer.phone}`} />
					<DetailItem label="Location" value={`${customer.city}, ${customer.country}`} />
				</dl>
			</Card.Content>
		</Card.Root>

		<ActivityCard type="contract" id={contract.id} />
	</div>
</div>
