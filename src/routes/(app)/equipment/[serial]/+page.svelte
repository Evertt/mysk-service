<script lang="ts">
	import { resolve } from "$app/paths";
	import PencilIcon from "@lucide/svelte/icons/pencil";

	import ActivityCard from "#lib/components/activity/activity-card.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { SiteCard } from "#lib/customers/components.ts";
	import { countryName } from "#lib/customers/index.ts";
	import {
		CategoryLabel,
		StatusBadge as EquipmentStatusBadge,
		WarrantyBadge,
	} from "#lib/equipment/components.ts";
	import { ServiceStats, ServiceTimeline } from "#lib/equipment/components.ts";
	import { detailSide } from "#lib/equipment/extensions.ts";
	import { categories, unitModel, unitTitle } from "#lib/equipment/index.ts";
	import { deleteEquipment, getEquipment } from "#lib/equipment/remotes.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { formatDate, label } from "#lib/i18n/index.ts";

	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getEquipment(params.serial));

	const unit = $derived(data.unit);
	const owner = $derived(data.unit.customer);
	const name = $derived(unitTitle(unit));
	const site = $derived(data.unit.site);
</script>

<svelte:head>
	<title>{unit.serialNumber} · {m.equipment_title()}</title>
</svelte:head>

<PageHeader
	title={name}
	description={[categories[unit.category].label, unit.name && unitModel(unit), unit.serialNumber]
		.filter(Boolean)
		.join(" · ")}
	breadcrumbs={[
		{ label: m.equipment_title(), href: resolve("/(app)/equipment") },
		{ label: unit.serialNumber },
	]}
>
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
			{m.common_edit()}
		</Button>
		<DeleteDialog
			form={deleteEquipment}
			id={String(unit.id)}
			title={m.equipment_delete_title({ serial: unit.serialNumber })}
			description={m.equipment_delete_description()}
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
				<Card.Title>{m.equipment_specifications()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-2 gap-4">
					{#if unit.name}
						<DetailItem label={m.equipment_field_name()} value={unit.name} />
					{/if}
					<DetailItem label={m.equipment_field_manufacturer()} value={unit.manufacturer} />
					<DetailItem label={m.equipment_detail_model()} value={unit.model} />
					<DetailItem label={m.equipment_field_serial_number()} value={unit.serialNumber} />
					<DetailItem label={m.equipment_field_category()}>
						<CategoryLabel category={unit.category} />
					</DetailItem>
					<DetailItem label={m.equipment_detail_site()} value={site.name} />
					<DetailItem label={m.equipment_detail_location()} value={unit.location} />
					<DetailItem label={m.equipment_column_installed()} value={formatDate(unit.installedAt)} />
					<DetailItem label={m.equipment_field_warranty()}>
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
				<Card.Title>{m.equipment_owner()}</Card.Title>
				<Card.Description>{owner.code}</Card.Description>
				<Card.Action>
					<Badge variant="outline">{label("customerSegment", owner.segment)}</Badge>
				</Card.Action>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-2 gap-4">
					<DetailItem
						label={m.equipment_owner_company()}
						value={owner.name}
						href={resolve("/(app)/customers/[code]", { code: owner.code })}
					/>
					<DetailItem label={m.equipment_owner_contact()} value={owner.contactName} />
					<DetailItem
						label={m.equipment_owner_email()}
						value={owner.email}
						href={`mailto:${owner.email}`}
					/>
					<DetailItem
						label={m.equipment_owner_phone()}
						value={owner.phone}
						href={`tel:${owner.phone}`}
					/>
					<DetailItem
						label={m.equipment_owner_location()}
						value={`${owner.city}, ${countryName(owner.country)}`}
					/>
				</dl>
			</Card.Content>
		</Card.Root>

		<SiteCard {site} title={m.equipment_detail_site()} />

		<ExtensionSlot point={detailSide} props={{ serialNumber: unit.serialNumber }} />

		<ActivityCard type="equipment" id={unit.id} />
	</div>
</div>
