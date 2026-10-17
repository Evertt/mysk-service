/**
 * How the energy module shows its figures: kW, kWh, € and kg, a change against the previous
 * period, a tone's badge and colour, and an alert's recommendation (§2.5's texts, in the reader's
 * language) and what it measured. Isomorphic.
 */
import type { BadgeTone } from "#lib/components/ui/badge/index.ts";
import { formatNumber, numberFormatter } from "#lib/i18n/index.ts";

import { energyLabels } from "./labels.ts";
import type { AlertMetric, DoorKind, ThresholdState, ZoneTone } from "./model.ts";

const oneDecimal = numberFormatter({ maximumFractionDigits: 1 });
const whole = numberFormatter({ maximumFractionDigits: 0 });
const precise = numberFormatter({ maximumFractionDigits: 3 });
const signed = numberFormatter({ maximumFractionDigits: 1, signDisplay: "exceptZero" });

/** Power: one decimal under 100 kW, whole above, e.g. `186.4 kW`, `1,204 kW`. */
export const formatKw = (kw: number) => `${kw < 100 ? oneDecimal(kw) : whole(kw)} kW`;

/** Energy, e.g. `1,482 kWh`, `12.4 kWh`. */
export const formatKwh = (kwh: number) => `${kwh < 100 ? oneDecimal(kwh) : whole(kwh)} kWh`;

/** CO₂, in kg or, from a tonne, t: `556 kg`, `1.4 t`. */
export const formatCo2 = (kg: number) =>
	kg >= 1000 ? `${oneDecimal(kg / 1000)} t` : `${whole(kg)} kg`;

/** A change in percent with its sign, e.g. `+12.8%`, `−7.2%`; a dash without one. */
export const formatChange = (change: number | null) =>
	change === null ? "—" : `${signed(change)}%`;

/** A share in percent, e.g. `12.8%`. */
export const formatPercent = (percent: number) => `${oneDecimal(percent)}%`;

/** A factor or tariff as it's set, e.g. `0.375`. */
export const formatFactor = (value: number) => precise(value);

/** Minutes, whole: `14 min`. */
export const formatMinutes = (minutes: number) => `${whole(Math.floor(minutes))} min`;

/**
 * A change's colour: less is good (green), more is bad (rose), as §2.5 shows consumption
 * (`invert`); within half a percent, neither.
 */
export function changeClass(change: number | null) {
	if (change === null || Math.abs(change) < 0.5) return "text-muted-foreground";
	return change < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400";
}

export const toneBadges: Record<ZoneTone, BadgeTone> = {
	nominal: "success",
	elevated: "warning",
	peak: "danger",
	offline: "neutral",
};

/** A zone's tone as a bar or dot. */
export const toneColours: Record<ZoneTone, string> = {
	nominal: "bg-emerald-500",
	elevated: "bg-amber-500",
	peak: "bg-rose-600",
	offline: "bg-muted-foreground/40",
};

export const stateBadges: Record<ThresholdState, BadgeTone> = {
	active: "danger",
	near: "warning",
	normal: "success",
	off: "neutral",
};

/** What an alert is about, for its recommendation and detail. */
interface AlertSubject {
	metric: AlertMetric;
	measured: number;
	threshold: number;
	zoneName: string;
	door: { name: string; kind: DoorKind; lossKw: number } | null;
}

/** §2.5's recommendation for an alert. */
export function recommendation(alert: AlertSubject) {
	const { door } = alert;
	if (alert.metric === "door" && door) {
		const kw = formatNumber(door.lossKw);
		return door.kind === "sectional"
			? m.energy_advice_sectional({ name: door.name, kw })
			: m.energy_advice_cold({
					name: door.name,
					minutes: whole(Math.floor(alert.measured)),
					kw,
				});
	}
	return m.energy_advice_zone({ zone: alert.zoneName });
}

/** What an alert measured against what, e.g. `Sectionaaldeur Dock 05 (Expeditie & Docks) · Door 14 of 10 min open`. */
export function alertDetail(alert: AlertSubject) {
	const subject = alert.door ? `${alert.door.name} (${alert.zoneName})` : alert.zoneName;
	const values = {
		measured: whole(alert.measured),
		threshold: whole(alert.threshold),
	};
	const amounts =
		alert.metric === "door"
			? m.energy_detail_door(values)
			: alert.metric === "energy"
				? m.energy_detail_energy(values)
				: m.energy_detail_power(values);
	return `${subject} · ${energyLabels.label("alertMetric", alert.metric)} ${amounts}`;
}
