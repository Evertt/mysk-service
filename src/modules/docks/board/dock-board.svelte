<!--
	@component
	The live board of a site's docks, as the client's mockup lays it out: the key figures (docks
	occupied, locked, not locked, doors open and the longest open, counting up), a big card per dock
	with Salvo (two a row on a wide screen), the docks without it, the rules' notices of the last
	day, and how Salvo secures a dock. Live: when the feed changes a dock, the board asks for the
	site again (`watchDocks`); the timers count on in the browser.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import DoorOpenIcon from "@lucide/svelte/icons/door-open";
	import LockIcon from "@lucide/svelte/icons/lock";
	import LockOpenIcon from "@lucide/svelte/icons/lock-open";
	import TimerIcon from "@lucide/svelte/icons/timer";
	import TruckIcon from "@lucide/svelte/icons/truck";

	import FilterChips from "#lib/components/filter-chips.svelte";
	import StatTile from "#lib/components/stat-tile.svelte";
	import { Clock } from "#lib/hooks/clock.svelte.ts";
	import { refreshOnChange } from "#lib/hooks/refresh-on-change.svelte.ts";
	import { formatNumber, formatStopwatch, formatTime } from "#lib/i18n/index.ts";

	import { watchDocks } from "../docks.remote.ts";
	import { dockFigures } from "../model.ts";
	import { getDockBoard } from "./board.remote.ts";
	import { type DockBoard, dockView } from "./board.ts";
	import ComponentsCard from "./components-card.svelte";
	import DockCard from "./dock-card.svelte";
	import ProcessCard from "./process-card.svelte";
	import SignalsCard from "./signals-card.svelte";

	let { board, siteId }: { board: DockBoard; siteId: number | undefined } = $props();

	// The timers count every second.
	const clock = new Clock(1000);
	const now = $derived(clock.now);

	// Live: a change to the docks (the feed's events, the rules, an edit) asks for the site again.
	refreshOnChange(watchDocks, () => getDockBoard(siteId).refresh());

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
	const siteChips = $derived(
		board.sites.map((site) => ({
			value: String(site.id),
			label: `${site.customer.name} — ${site.name}`,
			href: `${resolve("/(app)/(modules)/docks")}?site=${site.id}`,
		})),
	);
</script>

{#if board.sites.length > 1}
	<FilterChips
		label={m.docks_site_label()}
		options={siteChips}
		value={board.site ? String(board.site.id) : null}
	/>
{/if}

<div class="grid grid-cols-2 gap-4 lg:grid-cols-5" data-dock-figures>
	<StatTile
		label={m.docks_kpi_occupied()}
		value="{formatNumber(figures.occupied)}/{formatNumber(figures.total)}"
		icon={TruckIcon}
	/>
	<StatTile
		label={m.docks_kpi_locked()}
		value={formatNumber(figures.locked)}
		icon={LockIcon}
		tone="success"
	/>
	<StatTile
		label={m.docks_kpi_unlocked()}
		value={formatNumber(figures.unlocked)}
		icon={LockOpenIcon}
		tone="danger"
	/>
	<StatTile
		label={m.docks_kpi_doors_open()}
		value={formatNumber(figures.doorsOpen)}
		icon={DoorOpenIcon}
		tone="info"
	/>
	<StatTile
		label={m.docks_kpi_longest_open()}
		value={formatStopwatch(figures.longestOpen * 1000, { hours: true })}
		icon={TimerIcon}
		tone="warning"
	/>
</div>

<div class="grid gap-4 xl:grid-cols-2">
	{#each salvoDocks as dock (dock.id)}
		<DockCard {dock} {now} />
	{/each}
</div>

{#if otherDocks.length}
	<section class="flex flex-col gap-2" data-docks-without-salvo>
		<h2 class="text-sm font-medium text-muted-foreground">{m.docks_without_salvo()}</h2>
		<ul class="flex flex-wrap gap-2">
			{#each otherDocks as dock (dock.id)}
				<li class="rounded-md border bg-card px-3 py-1.5 text-sm" data-dock={dock.code}>
					<span class="font-medium">{dock.code}</span>
					<span class="text-muted-foreground">{dock.position}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

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
							<span class="font-medium">{notice.dock}</span>:
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

<section class="grid gap-4 lg:grid-cols-2">
	<ProcessCard />
	<SignalsCard />
	<div class="lg:col-span-2">
		<ComponentsCard />
	</div>
</section>
