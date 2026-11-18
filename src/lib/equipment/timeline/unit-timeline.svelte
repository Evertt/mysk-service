<!--
	@component
	A unit's timeline ("Wat gebeurt er met deze deur?"), the same in every shell: today's figures as
	a row of tiles (those the tenant's modules give: times opened, energy lost, its condition), then
	everything that happened to it as one list by day ("Today", "Yesterday", then dates), each entry
	with its time on the left, its icon in its tone's colour, what happened, a line about it, its
	order (a link to its page in the shell) and its photos; "Load more" reads the next page. It
	follows the shell's feed: a change to the unit or its parts, to its orders, or to what the
	modules say it shows (energy's readings in the office) reads it again.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";
	import CalendarClockIcon from "@lucide/svelte/icons/calendar-clock";
	import CameraIcon from "@lucide/svelte/icons/camera";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import CircleXIcon from "@lucide/svelte/icons/circle-x";
	import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
	import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
	import DoorOpenIcon from "@lucide/svelte/icons/door-open";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import PackageCheckIcon from "@lucide/svelte/icons/package-check";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import SirenIcon from "@lucide/svelte/icons/siren";
	import TruckIcon from "@lucide/svelte/icons/truck";
	import WrenchIcon from "@lucide/svelte/icons/wrench";
	import ZapIcon from "@lucide/svelte/icons/zap";
	import type { Component } from "svelte";

	import { refreshOnRecordChange } from "#lib/components/activity/change-feed.svelte.ts";
	import { refreshOnActivity } from "#lib/components/activity/live-activity.svelte.ts";
	import StatTile from "#lib/components/stat-tile.svelte";
	import { dayOf } from "#lib/dates.ts";
	import { formatDate, formatLongDay, formatNumber, formatTime } from "#lib/i18n/index.ts";
	import { OrderLink } from "#lib/orders/components.ts";

	import {
		getFieldUnitTimeline,
		getPortalUnitTimeline,
		getUnitTimeline,
	} from "./timeline.remote.ts";
	import {
		byDay,
		type TimelineCursor,
		type TimelineEntry,
		type TimelineIcon,
		type TimelineTone,
	} from "./timeline.ts";

	let {
		serial,
		shell,
		heading = true,
	}: {
		serial: string;
		/** Whose shell it's in: what it reads with, and where its orders link to. */
		shell: "office" | "engineer" | "customer";
		/** With its title and description (a portal's section may title it itself). */
		heading?: boolean;
	} = $props();

	const queries = {
		office: getUnitTimeline,
		engineer: getFieldUnitTimeline,
		customer: getPortalUnitTimeline,
	};
	const read = (before?: TimelineCursor) =>
		queries[shell]({
			serial,
			before: before && { at: before.at.toString(), id: before.id },
		});

	const first = $derived(await read());

	/** The pages read with "Load more", after the first. */
	let more = $state<{ entries: TimelineEntry[]; next: TimelineCursor | null }[]>([]);
	let loading = $state(false);

	const entries = $derived([...first.entries, ...more.flatMap((page) => page.entries)]);
	const next = $derived(more.length ? more[more.length - 1].next : first.next);
	const days = $derived(byDay(entries, dayOf));

	async function loadMore() {
		if (!next || loading) return;
		loading = true;
		try {
			const page = await read(next);
			more = [...more, { entries: page.entries, next: page.next }];
		} finally {
			loading = false;
		}
	}

	/** Reads the first page again, and drops the pages after it (they'd be out of step). */
	async function refresh() {
		await read().refresh();
		more = [];
	}

	refreshOnRecordChange(() => ({ type: "equipment", id: first.unitId }), refresh);
	refreshOnActivity(refresh, { types: first.liveTypes });

	const icons: Record<TimelineIcon, Component<{ class?: string }>> = {
		door: DoorOpenIcon,
		energy: ZapIcon,
		alert: AlertTriangleIcon,
		report: SirenIcon,
		order: ClipboardListIcon,
		scheduled: CalendarClockIcon,
		on_the_way: TruckIcon,
		started: WrenchIcon,
		completed: CircleCheckIcon,
		cancelled: CircleXIcon,
		photo: CameraIcon,
		document: FileTextIcon,
		condition: GaugeIcon,
		inspection: ClipboardCheckIcon,
		installed: PackageCheckIcon,
		warranty: ShieldCheckIcon,
	};

	/** The icon's colours by tone: the theme's tone tokens. */
	const toneClass: Record<TimelineTone, string> = {
		neutral: "bg-muted text-muted-foreground",
		info: "bg-info/10 text-info",
		success: "bg-success/10 text-success",
		warning: "bg-warning/10 text-warning",
		danger: "bg-destructive/10 text-destructive",
	};

	const dayLabel = (day: Temporal.PlainDate) =>
		day.equals(first.today)
			? m.equipment_timeline_today()
			: day.equals(first.today.subtract({ days: 1 }))
				? m.equipment_timeline_yesterday()
				: day.year === first.today.year
					? formatLongDay(day)
					: // Another year's day says its year.
						formatDate(day);

	const orderHref = (number: string) =>
		shell === "engineer"
			? resolve("/(field)/my/[number]", { number })
			: resolve("/(customer)/portal/orders/[number]", { number });
</script>

<section class="flex flex-col gap-4" data-unit-timeline aria-label={m.equipment_timeline_title()}>
	{#if heading}
		<header class="flex flex-col gap-1">
			<h2 class="text-lg font-semibold tracking-tight">{m.equipment_timeline_title()}</h2>
			<p class="text-sm text-muted-foreground">{m.equipment_timeline_description()}</p>
		</header>
	{/if}

	{#if first.figures?.length}
		<div
			class="grid grid-cols-2 gap-3 sm:grid-cols-3"
			role="group"
			aria-label={m.equipment_timeline_figures()}
			data-timeline-figures
		>
			{#each first.figures as figure (figure.key)}
				<div data-timeline-figure={figure.key}>
					<StatTile
						layout="card"
						label={figure.label}
						value={figure.value}
						tone={figure.tone ?? "neutral"}
						detail={figure.detail ?? undefined}
					/>
				</div>
			{/each}
		</div>
	{/if}

	{#if !entries.length}
		<p class="text-sm text-muted-foreground">{m.equipment_timeline_empty()}</p>
	{/if}

	{#each days as { day, entries: ofDay } (day.toString())}
		<div class="flex flex-col gap-2" data-timeline-day={day.toString()}>
			<h3 class="section-label text-xs font-medium tracking-wide text-muted-foreground uppercase">
				{dayLabel(day)}
			</h3>
			<ol class="flex flex-col">
				{#each ofDay as entry (entry.id)}
					{@const Icon = icons[entry.icon]}
					<li
						class="group relative grid grid-cols-[3rem_2rem_1fr] gap-x-3 pb-4 last:pb-0"
						data-timeline-entry={entry.kind}
					>
						<time
							datetime={entry.at.toString()}
							class="pt-1.5 text-right text-sm text-muted-foreground tabular-nums"
						>
							{formatTime(entry.at)}
						</time>
						<span class="relative flex justify-center">
							<!-- The line to the next entry of the day. -->
							<span
								aria-hidden="true"
								class="absolute top-9 -bottom-4 w-px bg-border group-last:hidden"
							></span>
							<span
								class="flex size-8 shrink-0 items-center justify-center rounded-full {toneClass[
									entry.tone
								]}"
							>
								<Icon class="size-4" />
							</span>
						</span>
						<div class="flex min-w-0 flex-col gap-1 pt-1">
							<p class="leading-snug font-medium">{entry.title}</p>
							{#if entry.detail}
								<p class="text-sm break-words text-muted-foreground">{entry.detail}</p>
							{/if}
							{#if entry.order}
								<p class="text-sm">
									{#if shell === "office"}
										<OrderLink number={entry.order} />
									{:else}
										<a
											class="font-medium text-primary underline-offset-4 hover:underline"
											href={orderHref(entry.order)}
										>
											{entry.order}
										</a>
									{/if}
								</p>
							{/if}
							{#if entry.photos?.length}
								<ul class="mt-1 flex flex-wrap gap-1.5" data-photo-thumbs={entry.photos.length}>
									{#each entry.photos.slice(0, 6) as photo, index (photo.id)}
										<li>
											<a
												href={photo.src}
												target="_blank"
												rel="noopener external"
												class="block size-12 overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
												aria-label={m.orders_photo_open({ number: formatNumber(index + 1) })}
											>
												<img src={photo.src} alt="" loading="lazy" class="size-full object-cover" />
											</a>
										</li>
									{/each}
									{#if entry.photos.length > 6}
										<li class="self-center text-xs text-muted-foreground tabular-nums">
											+{formatNumber(entry.photos.length - 6)}
										</li>
									{/if}
								</ul>
							{/if}
						</div>
					</li>
				{/each}
			</ol>
		</div>
	{/each}

	{#if next}
		<Button variant="outline" class="self-center" onclick={loadMore} disabled={loading}>
			{#if loading}<Spinner data-icon="inline-start" />{/if}
			{m.equipment_timeline_more()}
		</Button>
	{/if}
</section>
