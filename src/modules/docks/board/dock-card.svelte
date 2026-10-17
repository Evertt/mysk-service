<!--
	@component
	A dock on the live board: its state, the Wheel-Lok, the door-open timer (amber from 40 minutes,
	rose from 60), the truck at it, the Salvo safety block (SCP, key, beacon), a warning when it's
	unlocked with a truck, faulty or open too long, and its latest sessions.
-->
<script lang="ts">
	import LockIcon from "@lucide/svelte/icons/lock";
	import LockOpenIcon from "@lucide/svelte/icons/lock-open";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

	import { formatDateTime, formatTime } from "#lib/i18n/index.ts";

	import { timerClass } from "../display.ts";
	import { dockLabels } from "../labels.ts";
	import { formatDuration } from "../model.ts";
	import BeaconLight from "../ui/beacon-light.svelte";
	import StateBadge from "../ui/state-badge.svelte";
	import { type BoardDock, dockView } from "./board.ts";

	let { dock, now }: { dock: BoardDock; now: Temporal.Instant } = $props();

	const view = $derived(dockView(dock, now));
	const session = $derived(dock.session);
	const warningTexts = $derived({
		fault: m.docks_warning_fault(),
		red: m.docks_warning_red(),
		unlocked: m.docks_warning_unlocked(),
		amber: m.docks_warning_amber(),
	});
</script>

<Card.Root data-dock={dock.code} class="gap-4">
	<Card.Header>
		<Card.Title class="font-mono tracking-tight">{dock.code}</Card.Title>
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
			<div class="flex flex-wrap items-center justify-between gap-2">
				<span class="inline-flex items-center gap-1.5 font-medium" data-dock-lock>
					{#if dock.locked}
						<LockIcon class="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
						{m.docks_locked()}
					{:else}
						<LockOpenIcon class="size-4 text-muted-foreground" aria-hidden="true" />
						{m.docks_not_locked()}
					{/if}
				</span>
				<span
					class="font-mono tabular-nums {timerClass(view.openSeconds)}"
					data-door-timer={dock.doorOpenSince ? view.openSeconds : undefined}
					data-door-band={view.band ?? undefined}
				>
					{dock.doorOpenSince
						? m.docks_door_open_for({ time: formatDuration(view.openSeconds) })
						: m.docks_door_closed()}
				</span>
			</div>

			<div class="flex flex-col gap-0.5">
				{#if session}
					<span class="font-medium" data-dock-plate>
						{[session.carrier, session.plate].filter(Boolean).join(" · ")}
					</span>
					<span class="text-muted-foreground">
						{[
							session.reference,
							session.slotStart && session.slotEnd
								? m.docks_planned({ slot: formatTime.range(session.slotStart, session.slotEnd) })
								: null,
						]
							.filter(Boolean)
							.join(" · ")}
					</span>
				{:else}
					<span class="text-muted-foreground">{m.docks_no_truck()}</span>
				{/if}
			</div>
		{/if}

		{#if dock.scpCode}
			<section
				class="flex flex-col gap-1.5 rounded-md border p-3"
				aria-label={m.docks_salvo_title()}
			>
				<h3 class="text-xs font-medium text-muted-foreground">{m.docks_salvo_title()}</h3>
				<span class={dock.scpOnline === false ? "font-medium text-destructive" : ""}>
					{dock.scpOnline === false
						? m.docks_scp_fault({ code: dock.scpCode })
						: m.docks_scp_ok({ code: dock.scpCode })}
				</span>
				<span>
					{dock.keyId
						? `${m.docks_key_label({ id: dock.keyId })}: ${dockLabels.label("keyLocation", dock.keyLocation ?? "scp")}`
						: dockLabels.label("keyLocation", dock.keyLocation ?? "scp")}
				</span>
				{#if dock.keyStorageUnit}
					<span class="text-muted-foreground">
						{m.docks_key_storage_label({ unit: dock.keyStorageUnit })}
					</span>
				{/if}
				{#if dock.reported}
					<BeaconLight beacon={view.beacon} />
				{/if}
			</section>
		{/if}

		{#each view.warnings as warning (warning)}
			<p
				class="flex items-start gap-2 rounded-md p-2 {warning === 'fault' || warning === 'red'
					? 'bg-destructive/10 text-destructive'
					: 'bg-amber-500/15 text-amber-800 dark:text-amber-300'}"
				data-dock-warning={warning}
			>
				<TriangleAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
				<span>{warningTexts[warning]}</span>
			</p>
		{/each}

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
