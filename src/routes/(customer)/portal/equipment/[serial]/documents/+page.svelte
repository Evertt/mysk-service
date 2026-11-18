<!--
	One of the customer's units' manuals and documents in the portal, by kind, each a row to open or
	save: linked from its page, back to it from the app bar, which names the unit.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import AppBar from "#lib/client/app-bar.svelte";
	import { refreshOnRecordChange } from "#lib/components/activity/change-feed.svelte.ts";
	import { DocumentList } from "#lib/equipment/components.ts";
	import { unitTitle } from "#lib/equipment/index.ts";
	import { getUnitDocuments } from "#lib/equipment/remotes.ts";

	import { getPortalUnit } from "../../../client.remote.ts";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const [unit, documents] = $derived(
		await Promise.all([getPortalUnit(params.serial), getUnitDocuments(params.serial)]),
	);

	// Live: the unit, and its documents (logged on it).
	refreshOnRecordChange(
		() => ({ type: "equipment", id: unit.id }),
		() => {
			void getPortalUnit(params.serial).refresh();
			void getUnitDocuments(params.serial).refresh();
		},
	);
</script>

<AppBar
	title={m.client_unit_documents_link()}
	subtitle={unitTitle(unit)}
	back={{
		href: resolve("/(customer)/portal/equipment/[serial]", { serial: unit.serialNumber }),
		label: unitTitle(unit),
	}}
/>

{#if documents.documents.length}
	<DocumentList documents={documents.documents} size="lg" />
{:else}
	<p class="px-1 text-[0.9375rem] text-muted-foreground">{m.client_unit_documents_none()}</p>
{/if}
