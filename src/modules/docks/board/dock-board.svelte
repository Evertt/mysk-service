<!--
	@component
	The live board of a site's docks: the tiles (docks occupied, locked, not locked, doors open and
	the longest open, counting up), a card per dock, the rules' notices of the last day, and how a
	session goes. Live: when the feed changes a dock, the board asks for the site again
	(`watchDocks`); the timers count on in the browser.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import StatCard from "#lib/components/stat-card.svelte";
	import { formatNumber, formatTime } from "#lib/i18n/index.ts";

	import { watchDocks } from "../docks.remote.ts";
	import { dockFigures, formatDuration } from "../model.ts";
	import { getDockBoard } from "./board.remote.ts";
	import { type DockBoard, dockView } from "./board.ts";
	import { Clock } from "./clock.svelte.ts";
	import DockCard from "./dock-card.svelte";
	import ProcessCard from "./process-card.svelte";

	let { board, siteId }: { board: DockBoard; siteId: number | undefined } = $props();

	// The timers count every second.
	const clock = new Clock();
	const now = $derived(clock.now);

	// Live: a change to the docks (the feed's events, the rules, an edit) asks for the site again.
	const changes = watchDocks();
	let seen: number | undefined;
	$effect(() => {
		const changed = changes.current;
		if (changed === undefined) return;
		if (seen !== undefined && changed !== seen) void getDockBoard(siteId).refresh();
		seen = changed;
	});

	// The docks with Salvo get a card; the others (no live state) are listed below them.
	const salvoDocks = $derived(board.docks.filter((dock) => dock.scpCode || dock.reported));
	const otherDocks = $derived(board.docks.filter((dock) => !dock.scpCode && !dock.reported));
	// The tiles count the docks with Salvo that have reported.
	const monitored = $derived(board.docks.filter((dock) => dock.reported));
	const figures = $derived(
		dockFigures(
			monitored.map((dock) => ({
				state: dockView(dock, now).state,
				locked: dock.locked ?? false,
				doorOpenSince: dock.doorOpenSince,
			})),
			now,
		),
	);
	const siteHref = (id: number) => `${resolve("/(app)/(modules)/docks")}?site=${id}`;
</script>

{#if board.sites.length > 1}
	<nav class="flex flex-wrap gap-2" aria-label={m.docks_site_label()}>
		{#each board.sites as site (site.id)}
			<Button
				size="sm"
				variant={site.id === board.site?.id ? "default" : "outline"}
				href={siteHref(site.id)}
				aria-current={site.id === board.site?.id ? "page" : undefined}
			>
				{site.customer.name} — {site.name}
			</Button>
		{/each}
	</nav>
{/if}

<div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5" data-dock-figures>
	<StatCard
		label={m.docks_kpi_occupied()}
		value="{formatNumber(figures.occupied)}/{formatNumber(figures.total)}"
	/>
	<StatCard label={m.docks_kpi_locked()} value={formatNumber(figures.locked)} />
	<StatCard label={m.docks_kpi_unlocked()} value={formatNumber(figures.unlocked)} />
	<StatCard label={m.docks_kpi_doors_open()} value={formatNumber(figures.doorsOpen)} />
	<StatCard label={m.docks_kpi_longest_open()} value={formatDuration(figures.longestOpen)} />
</div>

<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
	{#each salvoDocks as dock (dock.id)}
		<DockCard {dock} {now} />
	{/each}
</div>

{#if otherDocks.length}
	<section class="flex flex-col gap-2" data-docks-without-salvo>
		<h2 class="text-sm font-medium text-muted-foreground">{m.docks_without_salvo()}</h2>
		<ul class="flex flex-wrap gap-2">
			{#each otherDocks as dock (dock.id)}
				<li class="rounded-md border px-3 py-1.5 text-sm" data-dock={dock.code}>
					<span class="font-mono">{dock.code}</span>
					<span class="text-muted-foreground">{dock.position}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<div class="grid gap-4 lg:grid-cols-2">
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.docks_notices_title()}</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if board.notices.length}
				<ul class="flex flex-col divide-y text-sm" data-dock-notices>
					{#each board.notices as notice (notice.id)}
						<li class="flex flex-wrap justify-between gap-x-3 py-2">
							<span>
								<span class="font-mono">{notice.dock}</span>:
								{notice.action === "door_escalated" ? m.docks_signal_red() : m.docks_signal_amber()}
								{#if notice.note}<span class="text-muted-foreground">({notice.note})</span>{/if}
							</span>
							<span class="text-muted-foreground tabular-nums">{formatTime(notice.at)}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-muted-foreground">{m.docks_no_notices()}</p>
			{/if}
		</Card.Content>
	</Card.Root>
	<ProcessCard />
</div>
