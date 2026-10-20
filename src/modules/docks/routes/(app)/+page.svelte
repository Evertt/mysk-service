<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	import PageBanner from "#lib/components/page-banner.svelte";
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
	// The demo's Salvo feed is simulated: the banner says so.
	const simulation = $derived(await getSimulation("docks"));
</script>

<svelte:head>
	<title>{m.docks_title()}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<PageBanner
		eyebrow={m.docks_banner_eyebrow()}
		title={m.docks_banner_title()}
		description={m.docks_banner_intro()}
	>
		{#snippet badges()}
			<span class="inline-flex items-center gap-1.5" data-feed={simulation ? "simulated" : "live"}>
				<span
					class="size-1.5 rounded-full bg-[color-mix(in_oklch,var(--success),white_40%)] {simulation?.running !==
					false
						? 'motion-safe:animate-pulse'
						: ''}"
					aria-hidden="true"
				></span>
				{simulation ? m.simulation_live() : m.docks_banner_live()}
			</span>
			{#if board.site}
				<span class="rounded bg-primary-foreground/15 px-2 py-0.5 normal-case">
					{m.docks_banner_site({ customer: board.site.customer.name, site: board.site.name })}
				</span>
			{/if}
		{/snippet}
		{#snippet actions()}
			<Button variant="secondary" href={resolve("/(app)/(modules)/docks/settings")}>
				<SettingsIcon data-icon="inline-start" />
				{m.docks_settings_title()}
			</Button>
		{/snippet}
	</PageBanner>

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
