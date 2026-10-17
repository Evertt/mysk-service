<!--
	@component
	A dock on the live board, as the client's mockup draws it: the dock itself (its door, beacon,
	truck and Wheel-Lok, `DockDrawing`), three tiles (the lock, the door-open timer, amber from 40
	minutes and rose from 60, and the position), the Salvo Safety System (SCP, key, beacon), the
	visit's details (carrier, order, time slot, door), a warning when it's unlocked with a truck,
	faulty or open too long (else a line on how it's going), and its latest sessions.
-->
<script lang="ts">
	import ArrowUpDownIcon from "@lucide/svelte/icons/arrow-up-down";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import ClockIcon from "@lucide/svelte/icons/clock";
	import KeyRoundIcon from "@lucide/svelte/icons/key-round";
	import LockIcon from "@lucide/svelte/icons/lock";
	import LockOpenIcon from "@lucide/svelte/icons/lock-open";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import type { Snippet } from "svelte";

	import { formatDateTime, formatTime } from "#lib/i18n/index.ts";

	import { timerClass } from "../display.ts";
	import { dockLabels } from "../labels.ts";
	import { formatDuration } from "../model.ts";
	import BeaconLight from "../ui/beacon-light.svelte";
	import StateBadge from "../ui/state-badge.svelte";
	import { type BoardDock, dockView } from "./board.ts";
	import DockDrawing from "./dock-drawing.svelte";

	let { dock, now }: { dock: BoardDock; now: Temporal.Instant } = $props();

	const view = $derived(dockView(dock, now));
	const session = $derived(dock.session);
	const doorOpen = $derived(dock.doorOpenSince !== null);
	const warningTexts = $derived({
		fault: m.docks_warning_fault(),
		red: m.docks_warning_red(),
		unlocked: m.docks_warning_unlocked(),
		amber: m.docks_warning_amber(),
	});
	// A dock that's fine says how it's going, as the mockup's remark does.
	const note = $derived.by(() => {
		if (view.warnings.length) return null;
		if (view.state === "loading") return m.docks_note_loading();
		if (view.state === "free") {
			return dock.keyLocation === "storage" ? m.docks_note_free() : m.docks_note_free_other();
		}
		return null;
	});
	const lockText = $derived.by(() => {
		if (!session) return m.docks_no_vehicle();
		return dock.locked ? m.docks_locked() : m.docks_not_locked();
	});
	const lockClass = $derived.by(() => {
		if (dock.locked) return "text-emerald-700 dark:text-emerald-400";
		return session ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground";
	});
	const drawingLabel = $derived(
		m.docks_drawing_label({
			code: dock.code,
			state: dockLabels.label("dockState", view.state),
			door: doorOpen ? m.docks_drawing_door_open() : m.docks_drawing_door_closed(),
		}),
	);
</script>

{#snippet tile(label: string, icon: Snippet, value: Snippet)}
	<div class="rounded-md border bg-muted/40 p-3">
		<div
			class="flex items-center gap-2 text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase"
		>
			{@render icon()}
			{label}
		</div>
		<div class="mt-1 text-sm font-semibold">{@render value()}</div>
	</div>
{/snippet}

<Card.Root data-dock={dock.code} class="gap-4 overflow-hidden">
	<Card.Header>
		<Card.Title class="tracking-tight">{dock.code}</Card.Title>
		<Card.Description>{dock.position}</Card.Description>
		<Card.Action>
			{#if dock.reported}
				<StateBadge state={view.state} />
			{:else}
				<Badge variant="outline">{dock.scpCode ? m.docks_no_state() : m.docks_no_salvo()}</Badge>
			{/if}
		</Card.Action>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4 text-sm">
		{#if dock.reported}
			<DockDrawing
				label={drawingLabel}
				{doorOpen}
				locked={dock.locked ?? false}
				beacon={view.beacon}
				truck={session}
			/>

			<div class="grid gap-3 sm:grid-cols-3">
				{#snippet lockIcon()}
					{#if dock.locked}
						<LockIcon class="size-3.5 text-emerald-600 dark:text-emerald-400" />
					{:else}
						<LockOpenIcon class="size-3.5 {session ? 'text-rose-600 dark:text-rose-400' : ''}" />
					{/if}
				{/snippet}
				{#snippet lockValue()}
					<span class={lockClass} data-dock-lock={dock.locked ? "locked" : "unlocked"}>
						{lockText}
					</span>
				{/snippet}
				{@render tile(m.docks_tile_lock(), lockIcon, lockValue)}

				{#snippet doorIcon()}
					<ClockIcon class="size-3.5" />
				{/snippet}
				{#snippet doorValue()}
					<span
						class="tabular-nums {doorOpen ? timerClass(view.openSeconds) : 'text-muted-foreground'}"
						data-door-timer={doorOpen ? view.openSeconds : undefined}
						data-door-band={view.band ?? undefined}
					>
						{doorOpen ? formatDuration(view.openSeconds) : m.docks_closed()}
					</span>
				{/snippet}
				{@render tile(m.docks_tile_door(), doorIcon, doorValue)}

				{#snippet positionIcon()}
					<ArrowUpDownIcon class="size-3.5" />
				{/snippet}
				{#snippet positionValue()}
					<span data-dock-plate={session?.plate ?? undefined}>
						{#if !session}
							{m.docks_position_free()}
						{:else if session.plate}
							{m.docks_position_taken({ plate: session.plate })}
						{:else}
							{m.docks_position_taken_no_plate()}
						{/if}
					</span>
				{/snippet}
				{@render tile(m.docks_tile_position(), positionIcon, positionValue)}
			</div>
		{/if}

		{#if dock.scpCode}
			<section class="rounded-md border" aria-label={m.docks_safety_title()}>
				<h3
					class="flex items-center gap-2 border-b px-3 py-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase"
				>
					<ShieldCheckIcon class="size-3.5 text-primary" />
					{m.docks_safety_title()}
				</h3>
				<div class="grid gap-3 p-3 sm:grid-cols-3">
					<div class="flex items-start gap-2">
						<span
							class="mt-0.5 grid h-7 w-6 shrink-0 place-items-center rounded-[3px] bg-slate-900 text-[7px] font-bold text-amber-300 italic"
							aria-hidden="true">SCP</span
						>
						<div class="min-w-0">
							<div class="text-[0.6875rem] text-muted-foreground">{m.docks_scp_panel()}</div>
							<div
								class="text-xs font-semibold {dock.scpOnline === false ? 'text-destructive' : ''}"
								data-scp={dock.scpOnline === false ? "fault" : "online"}
							>
								{dock.scpOnline === false
									? m.docks_scp_key_fault({ code: dock.scpCode })
									: m.docks_scp_online({ code: dock.scpCode })}
							</div>
						</div>
					</div>
					<div class="flex items-start gap-2">
						<KeyRoundIcon
							class="mt-0.5 size-5 shrink-0 {dock.keyLocation === 'driver'
								? 'text-amber-600 dark:text-amber-400'
								: 'text-primary'}"
						/>
						<div class="min-w-0">
							<div class="text-[0.6875rem] text-muted-foreground">
								{dock.keyId ? m.docks_key_title({ id: dock.keyId }) : m.docks_key_title_no_id()}
							</div>
							<div class="text-xs font-semibold" data-key-location={dock.keyLocation ?? "scp"}>
								{dockLabels.label("keyLocation", dock.keyLocation ?? "scp")}
							</div>
							{#if dock.keyStorageUnit}
								<div class="text-[0.625rem] text-muted-foreground">
									{m.docks_key_storage_label({ unit: dock.keyStorageUnit })}
								</div>
							{/if}
						</div>
					</div>
					{#if dock.reported}
						<BeaconLight beacon={view.beacon} />
					{/if}
				</div>
			</section>
		{/if}

		{#if dock.reported}
			<dl class="grid gap-x-6 gap-y-1 sm:grid-cols-2">
				<div class="flex justify-between gap-3 border-b py-1">
					<dt class="text-muted-foreground">{m.docks_detail_carrier()}</dt>
					<dd class="text-right font-medium">{session?.carrier ?? "—"}</dd>
				</div>
				<div class="flex justify-between gap-3 border-b py-1">
					<dt class="text-muted-foreground">{m.docks_detail_order()}</dt>
					<dd class="text-right font-medium">{session?.reference ?? "—"}</dd>
				</div>
				<div class="flex justify-between gap-3 border-b py-1">
					<dt class="text-muted-foreground">{m.docks_detail_slot()}</dt>
					<dd class="text-right font-medium tabular-nums">
						{session?.slotStart && session.slotEnd
							? formatTime.range(session.slotStart, session.slotEnd)
							: "—"}
					</dd>
				</div>
				<div class="flex justify-between gap-3 border-b py-1">
					<dt class="text-muted-foreground">{m.docks_detail_door()}</dt>
					<dd class="text-right font-medium">
						{doorOpen ? m.docks_door_opened() : m.docks_closed()}
					</dd>
				</div>
			</dl>
		{/if}

		{#each view.warnings as warning (warning)}
			<p
				class="flex items-start gap-2 rounded-md border px-3 py-2 text-xs {warning === 'fault' ||
				warning === 'red'
					? 'border-destructive/30 bg-destructive/10 text-destructive'
					: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'}"
				data-dock-warning={warning}
			>
				<TriangleAlertIcon class="mt-0.5 size-3.5 shrink-0" />
				<span>{warningTexts[warning]}</span>
			</p>
		{/each}
		{#if dock.reported && note}
			<p
				class="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
				data-dock-note
			>
				<CircleCheckIcon class="mt-0.5 size-3.5 shrink-0" />
				<span>{note}</span>
			</p>
		{/if}

		{#if dock.sessions.length}
			<section class="flex flex-col gap-1">
				<h3 class="text-xs font-medium text-muted-foreground">{m.docks_recent_sessions()}</h3>
				<ul class="flex flex-col divide-y text-xs" data-dock-sessions>
					{#each dock.sessions as each (each.id)}
						<li class="flex flex-wrap justify-between gap-x-3 py-1">
							<span class="tabular-nums">
								{formatDateTime(each.checkedInAt)}{each.checkedOutAt
									? ` – ${formatTime(each.checkedOutAt)}`
									: ""}
							</span>
							<span class="text-muted-foreground">
								{each.plate ?? ""}
								·
								{each.checkedOutAt
									? m.docks_session_door_open({ time: formatDuration(each.doorOpenSeconds) })
									: m.docks_session_open()}
							</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</Card.Content>
</Card.Root>
