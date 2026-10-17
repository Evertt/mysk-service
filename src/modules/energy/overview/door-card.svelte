<!--
	@component
	A monitored door ("deurbewaking"): open or closed (too long open past its threshold), how long
	it's been open (counting up), the loss now, and today's lost kWh and what they cost; the unit it
	is, and what the modules that enhance energy add (`energy.door`, e.g. the dock's state).
-->
<script lang="ts">
	import { resolve } from "$app/paths";

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
	const temperature = (value: number | null) =>
		value === null ? "—" : `${formatNumber(value)} °C`;
</script>

<Card.Root size="sm" data-door={door.code} data-door-state={state}>
	<Card.Header>
		<Card.Description class="flex items-center gap-2">
			<span class="font-mono">{door.code}</span>
			<span>{energyLabels.label("doorKind", door.kind)}</span>
		</Card.Description>
		<Card.Title>{door.name}</Card.Title>
		<Card.Action>
			<Badge variant={overdue ? "danger" : open ? "warning" : "success"}>{stateLabel}</Badge>
		</Card.Action>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3 text-sm">
		<dl class="grid grid-cols-2 gap-x-4 gap-y-2">
			<div>
				<dt class="text-xs text-muted-foreground">{m.energy_door_open_for()}</dt>
				<dd
					class={["font-medium tabular-nums", overdue && "text-rose-700 dark:text-rose-400"]}
					data-open-minutes
				>
					{open ? formatMinutes(minutes) : "—"}
					<span class="text-xs font-normal text-muted-foreground"
						>{m.energy_door_threshold({ minutes: formatNumber(door.thresholdMinutes) })}</span
					>
				</dd>
			</div>
			<div>
				<dt class="text-xs text-muted-foreground">{m.energy_door_loss_now()}</dt>
				<dd class="font-medium tabular-nums">{formatKw(open ? door.lossKw : 0)}</dd>
			</div>
			<div>
				<dt class="text-xs text-muted-foreground">{m.energy_door_loss_today()}</dt>
				<dd class="font-medium tabular-nums" data-loss-today>{formatKwh(door.lossKwhToday)}</dd>
			</div>
			<div>
				<dt class="text-xs text-muted-foreground">{m.energy_door_cost_today()}</dt>
				<dd class="font-medium tabular-nums">
					{formatCents(costCents(door.lossKwhToday, tariff))}
				</dd>
			</div>
		</dl>
		<p class="text-xs text-muted-foreground">
			{m.energy_door_details({
				zone: zoneName,
				openings: formatNumber(door.openingsToday),
				inside: temperature(door.insideC),
				outside: temperature(door.outsideC),
			})}
		</p>
		{#if door.unit}
			<a
				class="text-xs underline-offset-4 hover:underline"
				href={resolve("/(app)/equipment/[serial]", { serial: door.unit.serialNumber })}
				>{door.unit.name ?? door.unit.serialNumber}</a
			>
		{/if}
		<ExtensionSlot
			point={doorCard}
			props={{ doorId: door.id, code: door.code, equipmentId: door.equipmentId }}
		/>
	</Card.Content>
</Card.Root>
