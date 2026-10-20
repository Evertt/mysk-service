<script lang="ts">
	import { resolve } from "$app/paths";

	import EnumBadge from "#lib/components/enum-badge.svelte";
	import RecordPage from "#lib/components/record-page.svelte";
	import { CustomerCard, SiteCard } from "#lib/customers/components.ts";
	import {
		QrCard,
		ServiceStats,
		ServiceTimeline,
		SpecificationsCard,
		WarrantyBadge,
	} from "#lib/equipment/components.ts";
	import { points } from "#lib/equipment/extensions.ts";
	import { equipmentStatusDisplay, unitLine, unitTitle } from "#lib/equipment/index.ts";
	import { deleteEquipment, getEquipment } from "#lib/equipment/remotes.ts";

	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const unit = $derived((await getEquipment(params.serial)).unit);
	const name = $derived(unitTitle(unit));
</script>

<!-- The cards packed into columns: the timeline first, two columns wide, the others beside and
	under it. -->
<RecordPage
	layout="masonry"
	title={name}
	subtitle={unitLine(unit, { category: unit.category.name })}
	list={{ label: m.equipment_title(), href: resolve("/(app)/equipment") }}
	crumb={unit.serialNumber}
	edit={resolve("/(app)/equipment/[serial]/edit", { serial: unit.serialNumber })}
	remove={{
		form: deleteEquipment,
		id: String(unit.id),
		title: m.equipment_delete_title({ serial: unit.serialNumber }),
		description: m.equipment_delete_description(),
	}}
	subject={{ type: "equipment", id: unit.id }}
	slots={points.detail}
	slotProps={{ serialNumber: unit.serialNumber }}
>
	{#snippet badges()}
		<EnumBadge display={equipmentStatusDisplay} value={unit.status} />
		<WarrantyBadge until={unit.warrantyUntil} />
	{/snippet}

	{#snippet summary()}
		<ServiceStats serial={unit.serialNumber} />
	{/snippet}

	{#snippet main()}
		<ServiceTimeline serial={unit.serialNumber} />
	{/snippet}

	{#snippet side()}
		<SpecificationsCard {unit} />
		<CustomerCard customer={unit.customer} title={m.equipment_owner()} />
		<SiteCard site={unit.site} title={m.equipment_detail_site()} />
		<QrCard
			token={unit.qrToken}
			{name}
			printHref="{resolve('/(app)/equipment/labels/[site]', {
				site: String(unit.site.id),
			})}?unit={encodeURIComponent(unit.serialNumber)}"
		/>
	{/snippet}
</RecordPage>
