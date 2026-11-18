<!--
	One of the customer's units' manuals and documents in the portal, by kind, each to open or save:
	linked from its page (back to it from the top).
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";

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

<svelte:head>
	<title>{m.client_unit_documents_link()} · {unitTitle(unit)} · {m.client_title()}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	<header class="flex flex-col gap-1">
		<a
			href={resolve("/(customer)/portal/equipment/[serial]", { serial: unit.serialNumber })}
			class="inline-flex max-w-full items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
			data-unit-back
		>
			<ChevronLeftIcon class="size-4 shrink-0" aria-hidden="true" />
			<span class="truncate">{unitTitle(unit)}</span>
		</a>
		<h1 class="text-2xl font-semibold tracking-tight">{m.client_unit_documents_link()}</h1>
	</header>

	{#if documents.documents.length}
		<DocumentList documents={documents.documents} size="lg" />
	{:else}
		<p class="text-sm text-muted-foreground">{m.client_unit_documents_none()}</p>
	{/if}
</div>
