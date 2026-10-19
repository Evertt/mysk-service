<script lang="ts">
	import { resolve } from "$app/paths";
	import PencilIcon from "@lucide/svelte/icons/pencil";

	import ActivityCard from "#lib/components/activity/activity-card.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import { masonry, masonryGrid } from "#lib/components/masonry.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { SiteCard } from "#lib/customers/components.ts";
	import { countryName } from "#lib/customers/index.ts";
	import {
		StatusBadge as EquipmentStatusBadge,
		QrCard,
		WarrantyBadge,
	} from "#lib/equipment/components.ts";
	import { ServiceStats, ServiceTimeline } from "#lib/equipment/components.ts";
	import { detailSide } from "#lib/equipment/extensions.ts";
	import { unitLine, unitTitle } from "#lib/equipment/index.ts";
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
	description={unitLine(unit, { category: unit.category.name })}
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

<!-- The cards, packed into columns (`#lib/components/masonry.ts`): the timeline first, two columns
	wide, the others beside and under it. The slot's wrapper is `display: contents`, so each of the
	modules' cards is placed on its own. Columns at least 17rem wide (a card's header with a button
	still fits), three at most, by the page's width rather than the window's (the sidebar takes 16rem
	of it): one on a phone and next to the sidebar on a tablet, two on a small laptop, three on a
	laptop. -->
<div
	class={[
		masonryGrid,
		"grid-cols-[repeat(auto-fill,minmax(min(100%,max(17rem,calc((100%_-_3rem)/3))),1fr))] gap-6",
	]}
	data-unit-cards
	{@attach masonry}
>
	<div class="min-w-0" data-wide>
		<ServiceTimeline serial={unit.serialNumber} />
	</div>

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
				<DetailItem label={m.equipment_field_category()} value={unit.category.name} />
				<DetailItem label={m.equipment_detail_site()} value={site.name} />
				<DetailItem
					label={m.equipment_detail_location()}
					value={unit.location?.name}
					href={unit.location
						? resolve("/(app)/equipment/locations/[id]", { id: String(unit.location.id) })
						: undefined}
				/>
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

	<QrCard
		token={unit.qrToken}
		{name}
		printHref="{resolve('/(app)/equipment/labels/[site]', {
			site: String(site.id),
		})}?unit={encodeURIComponent(unit.serialNumber)}"
	/>

	<ExtensionSlot point={detailSide} props={{ serialNumber: unit.serialNumber }} />

	<ActivityCard type="equipment" id={unit.id} />
</div>
