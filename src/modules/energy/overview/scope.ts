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
