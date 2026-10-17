<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	import PageHeader from "#lib/components/page-header.svelte";
	import SimulationBar from "#lib/components/simulation/simulation-bar.svelte";
	import { getSimulation } from "#lib/components/simulation/simulation.remote.ts";
	import { getDockBoard } from "#modules/docks/board/board.remote.ts";
	import DockBoard from "#modules/docks/board/dock-board.svelte";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/docks"> } = $props();

	// The site the board shows (`?site=`), else the first with docks.
	const siteId = $derived.by(() => {
		const value = Number(page.url.searchParams.get("site"));
		return Number.isInteger(value) && value > 0 ? value : undefined;
	});
	const board = $derived(await getDockBoard(siteId));
	// The demo's Salvo feed is simulated: the badge says so.
	const simulation = $derived(await getSimulation("docks"));
</script>

<svelte:head>
	<title>{m.docks_title()}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<PageHeader
		title={m.docks_title()}
		description={board.site
			? `${board.site.customer.name} — ${board.site.name} · ${m.docks_description()}`
			: m.docks_description()}
	>
		{#snippet badges()}
			<Badge variant="success" data-feed={simulation ? "simulated" : "live"}>
				{simulation ? m.simulation_live() : m.docks_live()}
			</Badge>
		{/snippet}
		{#snippet actions()}
			{#if board.canManage}
				<Button variant="outline" href={resolve("/(app)/(modules)/docks/settings")}>
					<SettingsIcon data-icon="inline-start" />
					{m.docks_settings_title()}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	<SimulationBar module="docks" label={m.docks_simulation_title()} />

	{#if board.site}
		<DockBoard {board} {siteId} />
	{:else}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Title>{m.docks_no_docks_title()}</Empty.Title>
				<Empty.Description>{m.docks_no_docks_description()}</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{/if}
</div>
