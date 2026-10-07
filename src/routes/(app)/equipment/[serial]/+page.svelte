<script lang="ts">
	import { resolve } from "$app/paths";
	import PencilIcon from "@lucide/svelte/icons/pencil";

	import DetailItem from "#lib/components/detail-item.svelte";
	import CategoryLabel from "#lib/components/equipment/category-label.svelte";
	import { categories } from "#lib/components/equipment/display.js";
	import EquipmentStatusBadge from "#lib/components/equipment/status-badge.svelte";
	import WarrantyBadge from "#lib/components/equipment/warranty-badge.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatDate, humanize } from "#lib/format.js";

	import ModuleSlots from "../../module-slots.svelte";
	import { deleteEquipment, getEquipment } from "../equipment.remote.js";
	import type { PageProps } from "./$types";
	import ServiceStats from "./service-stats.svelte";
	import ServiceTimeline from "./service-timeline.svelte";

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

<ServiceStats serial={unit.serialNumber} />

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="flex min-w-0 flex-col gap-6 lg:col-span-2">
		<ServiceTimeline serial={unit.serialNumber} />
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

		<ModuleSlots name="equipment" props={{ serialNumber: unit.serialNumber }} />
	</div>
</div>
