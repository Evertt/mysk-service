/**
 * What the site's page shows of a scope (the whole building, a floor, a zone; "scope chips"): its
 * zones, the KPI tiles over them with their change against the previous period, the per-zone
 * comparison and the savings advice (§2.5). From the site's figures (`server/figures.ts`), so the
 * page switches scope without asking the server. Isomorphic.
 */
import {
	changePercent,
	co2Kg,
	costCents,
	INTERVAL_MINUTES,
	nightModeKwh,
	peakShiftKw,
	weightedChange,
} from "../model.ts";
import type { DoorFigures, ZoneFigures } from "../server/figures.ts";

export type Scope =
	| { kind: "building" }
	| { kind: "floor"; floor: string }
	| { kind: "zone"; code: string };

/** A scope from the URL's `scope` (`floor:Begane grond`, `zone:Z-R61`; anything else the building). */
export function parseScope(param: string | null | undefined): Scope {
	if (param?.startsWith("floor:")) return { kind: "floor", floor: param.slice(6) };
	if (param?.startsWith("zone:")) return { kind: "zone", code: param.slice(5) };
	return { kind: "building" };
}

/** A scope as the URL has it, or null for the building. */
export const scopeParam = (scope: Scope) =>
	scope.kind === "floor"
		? `floor:${scope.floor}`
		: scope.kind === "zone"
			? `zone:${scope.code}`
			: null;

/** The floors of the zones, in the zones' order (zones without one aren't on a floor). */
export const floorsOf = (zones: readonly { floor: string | null }[]) => [
	...new Set(zones.flatMap((zone) => (zone.floor ? [zone.floor] : []))),
];

/** The zones in `scope`. */
export function zonesIn<Z extends { code: string; floor: string | null }>(
	zones: readonly Z[],
	scope: Scope,
): Z[] {
	if (scope.kind === "floor") return zones.filter((zone) => zone.floor === scope.floor);
	if (scope.kind === "zone") return zones.filter((zone) => zone.code === scope.code);
	return [...zones];
}

/** The doors in the zones. */
export const doorsIn = (doors: readonly DoorFigures[], zones: readonly { id: number }[]) =>
	doors.filter((door) => zones.some((zone) => zone.id === door.zoneId));

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** The KPI tiles over zones and their doors, at a site's tariff and CO₂ factor. */
export function kpisOf(
	zones: readonly ZoneFigures[],
	doors: readonly DoorFigures[],
	site: { tariff: number; co2Factor: number },
	/** Whether the readings cover the previous period: else there's no change to show. */
	previousComplete = true,
) {
	const compare = <T>(change: T) => (previousComplete ? change : null);
	const kwh = sum(zones.map((zone) => zone.kwh));
	const previousKwh = sum(zones.map((zone) => zone.previousKwh));
	const peakKw = Math.max(0, ...zones.map((zone) => zone.peakKw));
	const previousPeakKw = Math.max(0, ...zones.map((zone) => zone.previousPeakKw));
	const doorLoss = sum(doors.map((door) => door.lossKwh));
	const previousDoorLoss = sum(doors.map((door) => door.previousLossKwh));
	return {
		liveKw: sum(zones.map((zone) => zone.liveKw)),
		kwh,
		previousKwh,
		/** §2.5's R: the zones' changes weighted by their consumption. */
		change: compare(
			weightedChange(zones.map((zone) => ({ current: zone.kwh, previous: zone.previousKwh }))),
		),
		costCents: costCents(kwh, site.tariff),
		peakKw,
		previousPeakKw,
		peakChange: compare(changePercent(peakKw, previousPeakKw)),
		co2Kg: co2Kg(kwh, site.co2Factor),
		previousCo2Kg: co2Kg(previousKwh, site.co2Factor),
		/** Zones over their thresholds now, and doors open too long now. */
		activeAlerts:
			zones.filter((zone) => zone.state === "active").length +
			doors.filter((door) => door.overdue).length,
		doorLossKwh: doorLoss,
		previousDoorLossKwh: previousDoorLoss,
		doorLossChange: compare(changePercent(doorLoss, previousDoorLoss)),
		doorLossCents: costCents(doorLoss, site.tariff),
	};
}

export type Kpis = ReturnType<typeof kpisOf>;

/** §2.5's savings advice, from the scope's figures: shifting the peak, the comparison, night mode. */
export const savingsOf = (kpis: Kpis) => ({
	peakShiftKw: peakShiftKw(kpis.peakKw),
	change: kpis.change,
	nightModeKwh: nightModeKwh(kpis.kwh),
});

/** A zone's row in the comparison per zone ("Vergelijking per zone"). */
export const comparisonOf = (zone: ZoneFigures, previousComplete = true) => ({
	...zone,
	change: previousComplete ? changePercent(zone.kwh, zone.previousKwh) : null,
});

/** A consumer of the site ("installatie"), in a zone. */
interface Consumer {
	id: number;
	zoneId: number;
	name: string;
	ratedKw: number;
}

/**
 * The installations of the scope's zones with what each likely draws now, the most first: its
 * zone's live power by its share of the zone's rated power (a zone has one meter, not one per
 * installation). At most `limit`.
 */
export function installationsOf(
	zones: readonly { id: number; liveKw: number }[],
	consumers: readonly Consumer[],
	limit = 5,
) {
	return zones
		.flatMap((zone) => {
			const own = consumers.filter((consumer) => consumer.zoneId === zone.id);
			const rated = sum(own.map((consumer) => consumer.ratedKw));
			return own.map((consumer) => ({
				...consumer,
				kwNow: rated > 0 ? (zone.liveKw * consumer.ratedKw) / rated : 0,
			}));
		})
		.toSorted((a, b) => b.kwNow - a.kwNow || b.ratedKw - a.ratedKw)
		.slice(0, limit);
}

/** What the "Signalering" card lists: zones over or near their thresholds, doors open too long. */
export function signalsOf(
	zones: readonly ZoneFigures[],
	doors: readonly { id: number; name: string; overdue: boolean; minutesOpen: number }[],
	limit = 4,
) {
	const zoneSignals = zones
		.filter((zone) => zone.state === "active" || zone.state === "near")
		.toSorted((a, b) => b.ratio - a.ratio)
		.map((zone) => ({
			key: `zone:${zone.id}`,
			name: zone.name,
			kind: zone.state === "active" ? ("over" as const) : ("near" as const),
			minutes: 0,
		}));
	const doorSignals = doors
		.filter((door) => door.overdue)
		.map((door) => ({
			key: `door:${door.id}`,
			name: door.name,
			kind: "door" as const,
			minutes: door.minutesOpen,
		}));
	// Over first, then the doors, then the zones that are only near.
	return [
		...zoneSignals.filter((signal) => signal.kind === "over"),
		...doorSignals,
		...zoneSignals.filter((signal) => signal.kind === "near"),
	].slice(0, limit);
}

/** How far the readings are into a period: the bucket they're in and how much of it they cover. */
interface MeasuredSoFar {
	/** The bucket (an hour of the day, a day of the month) the readings end in; −1 before the first. */
	index: number;
	/** The share of that bucket they cover, 0 to 1. */
	fraction: number;
}

/**
 * Where the readings end (`until`, the end of the latest interval in) in a period from `from`,
 * by hours (a day) or days (a month), in the site's `timeZone`.
 */
export function measuredSoFar(
	bucket: "hour" | "day",
	from: Temporal.Instant,
	until: Temporal.Instant | null,
	timeZone: string,
): MeasuredSoFar {
	if (!until || Temporal.Instant.compare(until, from) <= 0) return { index: -1, fraction: 1 };
	const local = until.toZonedDateTimeISO(timeZone);
	const start = from.toZonedDateTimeISO(timeZone);
	if (bucket === "hour") {
		const days = start.toPlainDate().until(local.toPlainDate()).days;
		if (days > 0) return { index: 23, fraction: 1 };
		return { index: local.hour, fraction: (local.minute + local.second / 60) / 60 };
	}
	const midnight = local.startOfDay();
	return {
		index: start.toPlainDate().until(local.toPlainDate()).days,
		fraction: local.since(midnight).total("hours") / local.hoursInDay,
	};
}

/** A bar of the consumption chart: what's measured, what the whole bucket will likely be, before. */
export interface ConsumptionBar {
	/** kWh measured in the bucket. */
	measured: number;
	/** kWh the whole bucket comes to: measured for a past one, else projected ("nog te meten"). */
	expected: number;
	/** kWh in the previous period's bucket ("vergelijking"). */
	previous: number;
	/** Measured in full, being measured now, or still to come. */
	state: "measured" | "current" | "remaining";
}

/** From this share of a bucket on, the bucket's own readings project the rest of it. */
const PROJECT_FROM = 0.25;

/**
 * The chart's bars: the buckets measured so far, the one being measured, and the rest projected
 * from the previous period's (as the mockup's "Nog te meten"), scaled by how this period compares
 * with it so far (between 0.6 and 1.6, so one odd hour doesn't run away with it). The current
 * bucket's projection is its own pace once it's a quarter in, before that the previous period's.
 */
export function consumptionBars(
	current: readonly number[],
	previous: readonly number[],
	{ index, fraction }: MeasuredSoFar,
): ConsumptionBar[] {
	const length = Math.max(current.length, previous.length);
	const at = (values: readonly number[], i: number) => values[i] ?? 0;
	const soFar = sum(current.slice(0, Math.max(0, index + 1)));
	const before =
		sum(previous.slice(0, Math.max(0, index))) + (index >= 0 ? at(previous, index) * fraction : 0);
	const trend = before > 0 && soFar > 0 ? Math.min(1.6, Math.max(0.6, soFar / before)) : 1;
	return Array.from({ length }, (_, i) => {
		const measured = at(current, i);
		const previousKwh = at(previous, i);
		if (i < index || (i === index && fraction >= 1)) {
			return { measured, expected: measured, previous: previousKwh, state: "measured" as const };
		}
		if (i === index) {
			const projected = fraction >= PROJECT_FROM ? measured / fraction : previousKwh * trend;
			return {
				measured,
				expected: Math.max(measured, projected),
				previous: previousKwh,
				state: "current" as const,
			};
		}
		return {
			measured: 0,
			expected: previousKwh * trend,
			previous: previousKwh,
			state: "remaining" as const,
		};
	});
}

/** The latest moment the zones' readings cover: the end of the newest interval in, if any. */
export function readingsUntil(zones: readonly { latestAt: Temporal.Instant | null }[]) {
	const latest = zones
		.flatMap((zone) => (zone.latestAt ? [zone.latestAt] : []))
		.toSorted((a, b) => Temporal.Instant.compare(a, b))
		.at(-1);
	return latest ? latest.add({ minutes: INTERVAL_MINUTES }) : null;
}

/** The scope's kWh per bucket, now and before (the chart). */
export function seriesOf(zones: readonly ZoneFigures[]) {
	const length = Math.max(0, ...zones.map((zone) => zone.series.length));
	const previousLength = Math.max(0, ...zones.map((zone) => zone.previousSeries.length));
	return {
		current: Array.from({ length }, (_, i) => sum(zones.map((zone) => zone.series[i] ?? 0))),
		previous: Array.from({ length: previousLength }, (_, i) =>
			sum(zones.map((zone) => zone.previousSeries[i] ?? 0)),
		),
	};
}
