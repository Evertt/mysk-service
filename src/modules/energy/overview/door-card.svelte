<!--
	@component
	A monitored door ("deurbewaking"), as the mockup draws it: its kind's icon, name, kind and zone,
	and a badge open, closed or too long open (past its threshold); a picture of the door whose panel
	rises when it opens, the warm or cold air leaking out in bars (faster once it's open too long), a
	snowflake on a cold or freezer store's, a truck backing up to an open dock door, and under it the
	temperatures and how long it's been open (counting up); the loss now, today's lost kWh and their
	cost, how often it opened today and from when it alerts. The unit it is, and what the modules
	that enhance energy add (`energy.door`, e.g. the dock's state). The picture moves only with the
	door's real state, and not at all with reduced motion.
-->
<script lang="ts">
	import SnowflakeIcon from "@lucide/svelte/icons/snowflake";
	import ThermometerIcon from "@lucide/svelte/icons/thermometer";
	import TruckIcon from "@lucide/svelte/icons/truck";

	import { EquipmentLink } from "#lib/equipment/components.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { formatCents, formatNumber } from "#lib/i18n/index.ts";

	import { doorCard } from "../api/extensions.ts";
	import { formatKw, formatKwh, formatMinutes } from "../display.ts";
	import { energyLabels } from "../labels.ts";
	import { costCents, isOverdue } from "../model.ts";
	import type { DoorFigures } from "../server/figures.ts";

	let {
		door,
		zoneName,
		tariff,
		now,
	}: { door: DoorFigures; zoneName: string; tariff: number; now: Temporal.Instant } = $props();

	const open = $derived(door.openedAt !== null);
	/** Counting up between the feed's batches. */
	const minutes = $derived(
		door.openedAt ? Math.max(door.minutesOpen, now.since(door.openedAt).total("minutes")) : 0,
	);
	const overdue = $derived(open && isOverdue(minutes, door.thresholdMinutes));
	const state = $derived(overdue ? "overdue" : open ? "open" : "closed");
	const stateLabel = $derived(
		overdue ? m.energy_door_overdue() : open ? m.energy_door_open() : m.energy_door_closed(),
	);
	const cold = $derived(door.kind !== "sectional");
	const Icon = $derived(
		door.kind === "sectional"
			? TruckIcon
			: door.kind === "freezer"
				? SnowflakeIcon
				: ThermometerIcon,
	);
	/** The kind's colours: its icon's, and the air that leaks out (warm from a hall, cold from a store). */
	const accent = $derived(
		door.kind === "sectional"
			? "text-slate-600 dark:text-slate-300"
			: door.kind === "freezer"
				? "text-sky-600 dark:text-sky-400"
				: "text-cyan-600 dark:text-cyan-400",
	);
	const leak = $derived(
		door.kind === "sectional"
			? "bg-amber-400"
			: door.kind === "freezer"
				? "bg-sky-400"
				: "bg-cyan-400",
	);
	const temperature = (value: number | null) =>
		value === null ? "—" : `${value > 0 ? "+" : ""}${formatNumber(value)} °C`;
</script>

<Card.Root
	size="sm"
	class={[overdue && "ring-destructive/40"]}
	data-door={door.code}
	data-door-state={state}
>
	<Card.Header>
		<Card.Title class="flex min-w-0 items-center gap-1.5 text-sm">
			<Icon class={["size-3.5 shrink-0", accent]} aria-hidden="true" />
			<span class="truncate">{door.name}</span>
		</Card.Title>
		<Card.Description class="text-xs">
			<span class="font-mono">{door.code}</span> · {energyLabels.label("doorKind", door.kind)} ·
			{zoneName}
		</Card.Description>
		<Card.Action>
			<Badge variant={overdue ? "danger" : open ? "warning" : "success"}>{stateLabel}</Badge>
		</Card.Action>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3 text-sm">
		<div
			class="relative h-24 overflow-hidden rounded-md border bg-linear-to-b from-slate-100 to-slate-200 dark:border-white/10 dark:from-slate-800 dark:to-slate-900"
			role="img"
			aria-label="{door.name}: {stateLabel}"
			data-door-picture
		>
			<div
				class="absolute inset-x-2 top-2 bottom-6 overflow-hidden rounded-xs border-2 border-slate-400 bg-slate-800 dark:border-slate-500 dark:bg-slate-950"
			>
				<!-- The panel: down when shut, up when open. -->
				<div
					class="panel absolute inset-x-0 top-0 transition-[height] duration-700 ease-in-out motion-reduce:transition-none"
					style:height={open ? "12%" : "100%"}
					data-panel={open ? "up" : "down"}
				></div>
				{#if open}
					<div
						class={[
							"leak absolute inset-y-0 left-1 flex flex-col justify-around",
							overdue && "fast",
						]}
						data-leak
					>
						{#each [0, 1, 2] as bar (bar)}
							<span
								class={["block h-1 w-5 rounded-full", leak]}
								style:animation-delay="{bar * 0.35}s"
							></span>
						{/each}
					</div>
				{/if}
				{#if cold}
					<SnowflakeIcon
						data-snowflake
						class={[
							"absolute top-1.5 right-1.5 size-3.5 transition-colors",
							open ? "text-sky-300" : "text-slate-500",
						]}
						aria-hidden="true"
					/>
				{/if}
			</div>
			{#if !cold && open}
				<div class="truck absolute right-4 bottom-7 text-slate-200" data-truck>
					<TruckIcon class="size-5" aria-hidden="true" />
				</div>
			{/if}
			<div
				class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-slate-800 px-2 py-1 text-[0.5625rem] font-medium text-slate-200 dark:bg-slate-950"
			>
				<span>{m.energy_door_inside({ temperature: temperature(door.insideC) })}</span>
				<span class={["tabular-nums", overdue && "text-rose-300"]} data-open-minutes
					>{open
						? m.energy_door_minutes_open({ minutes: formatMinutes(minutes) })
						: m.energy_door_shut()}</span
				>
				<span>{m.energy_door_outside({ temperature: temperature(door.outsideC) })}</span>
			</div>
		</div>

		<dl class="grid grid-cols-3 gap-2 text-center text-[0.625rem] text-muted-foreground">
			<div class="rounded-sm bg-muted py-1.5">
				<dt>{m.energy_door_loss_now()}</dt>
				<dd class="text-xs font-semibold text-foreground tabular-nums">
					{formatKw(open ? door.lossKw : 0)}
				</dd>
			</div>
			<div class="rounded-sm bg-muted py-1.5">
				<dt>{m.energy_door_today()}</dt>
				<dd class="text-xs font-semibold text-foreground tabular-nums" data-loss-today>
					{formatKwh(door.lossKwhToday)}
				</dd>
			</div>
			<div class="rounded-sm bg-muted py-1.5">
				<dt>{m.energy_door_cost()}</dt>
				<dd class="text-xs font-semibold text-foreground tabular-nums">
					{formatCents(costCents(door.lossKwhToday, tariff))}
				</dd>
			</div>
		</dl>
		<p class="text-[0.625rem] text-muted-foreground">
			{m.energy_door_footer({
				openings: formatNumber(door.openingsToday),
				minutes: formatNumber(door.thresholdMinutes),
			})}
		</p>
		{#if door.unit}
			<EquipmentLink
				serialNumber={door.unit.serialNumber}
				class="text-xs underline-offset-4 hover:underline"
				>{door.unit.name ?? door.unit.serialNumber}</EquipmentLink
			>
		{/if}
		<ExtensionSlot
			point={doorCard}
			props={{ doorId: door.id, code: door.code, equipmentId: door.equipmentId }}
		/>
	</Card.Content>
</Card.Root>

<style>
	.panel {
		background-color: #cbd5e1;
		background-image: repeating-linear-gradient(180deg, #cbd5e1 0 6px, #94a3b8 6px 7px);
	}
	:global(.dark) .panel {
		background-color: #64748b;
		background-image: repeating-linear-gradient(180deg, #64748b 0 6px, #475569 6px 7px);
	}
	.leak span {
		animation: door-leak 1.5s linear infinite;
	}
	.leak.fast span {
		animation-duration: 0.9s;
	}
	.truck {
		animation: door-truck 1.2s ease-out both;
	}
	@keyframes door-leak {
		0% {
			transform: translateX(0) scaleX(0.6);
			opacity: 0;
		}
		25% {
			opacity: 0.95;
		}
		100% {
			transform: translateX(34px) scaleX(1.4);
			opacity: 0;
		}
	}
	@keyframes door-truck {
		0% {
			transform: translateX(22px);
		}
		100% {
			transform: translateX(0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.leak span,
		.truck {
			animation: none;
		}
		.leak span {
			opacity: 0.8;
		}
	}
</style>
