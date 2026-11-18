<!--
	A unit in the engineer portal, where its QR code leads an engineer (`/q/<token>`): what it is,
	where, their open orders on it, and its manuals and documents to open on the spot.
-->
<script lang="ts">
	import { refreshOnRecordChange } from "#lib/components/activity/change-feed.svelte.ts";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { DocumentList } from "#lib/equipment/components.ts";
	import { unitLine, unitTitle, equipmentStatusDisplay } from "#lib/equipment/index.ts";
	import { getUnitDocuments } from "#lib/equipment/remotes.ts";

	import PlaceCard from "../../place-card.svelte";
	import { getMyUnit } from "../../places.remote.ts";
	import ScannedOrders from "../../scanned-orders.svelte";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const [data, documents] = $derived(
		await Promise.all([getMyUnit(params.serial), getUnitDocuments(params.serial)]),
	);
	const unit = $derived(data.unit);

	// Live: its documents, which the office adds, renames and deletes (logged on the unit).
	refreshOnRecordChange(
		() => ({ type: "equipment", id: unit.id }),
		() => getUnitDocuments(params.serial).refresh(),
	);
</script>

<svelte:head>
	<title>{unit.serialNumber} · {m.portal_title()}</title>
</svelte:head>

<header class="flex flex-col gap-2">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-2xl font-semibold tracking-tight">{unitTitle(unit)}</h1>
		<EnumBadge display={equipmentStatusDisplay} value={unit.status} />
	</div>
	<p class="text-sm text-muted-foreground">
		{unitLine(unit, { category: unit.category })}
	</p>
</header>

<ScannedOrders orders={data.orders} />

<PlaceCard site={unit.site} location={unit.location} />

<Card.Root data-unit-documents>
	<Card.Header>
		<Card.Title>{m.portal_unit_documents()}</Card.Title>
	</Card.Header>
	<Card.Content>
		{#if documents.documents.length}
			<DocumentList documents={documents.documents} size="lg" />
		{:else}
			<p class="text-sm text-muted-foreground">{m.portal_unit_documents_none()}</p>
		{/if}
	</Card.Content>
</Card.Root>
