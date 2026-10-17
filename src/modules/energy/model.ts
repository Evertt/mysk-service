/**
 * The energy module's rules, pure (`docs/plans/shltr-domain.md` §2.5 and §4.2 `energy`), with real
 * data instead of the mockup's simulation: a zone's readings are aggregates per 15 minutes (average
 * and peak kW, kWh), a door's are its open and close events. From them: a zone's live power and
 * consumption, the comparison with the previous period, a zone's threshold state and tone, a
 * door's open time and loss, cost and CO₂, and when a zone or a door raises an alert. Isomorphic;
 * the server works out the pages' figures and the ingest's alerts with these, and the specs hold
 * them to §2.5.
 */

/** A reading's interval. */
export const INTERVAL_MINUTES = 15;

/** A zone whose latest reading ended longer ago than this is offline. */
const OFFLINE_AFTER_MINUTES = 30;

/** The mockup's constants (§2.5): a site's defaults. */
export const DEFAULT_TARIFF = 0.28;
export const DEFAULT_CO2_FACTOR = 0.375;

/** At this share of a threshold a zone is near it ("binnen 15% van grenswaarde"). */
const NEAR_RATIO = 0.85;

const zoneTones = ["nominal", "elevated", "peak", "offline"] as const;
/** How a zone's load reads: nominaal, verhoogd, piekbelasting, offline. */
export type ZoneTone = (typeof zoneTones)[number];

const thresholdStates = ["active", "near", "normal", "off"] as const;
/** A zone against its thresholds: over them, within 15%, below, or not watched. */
export type ThresholdState = (typeof thresholdStates)[number];

export const alertMetrics = ["power", "energy", "door"] as const;
/** What an alert measured: a zone's power (kW), its consumption today (kWh), a door's open time. */
export type AlertMetric = (typeof alertMetrics)[number];

export const alertSeverities = ["active", "near"] as const;
export type AlertSeverity = (typeof alertSeverities)[number];

/** An alert's way: open, turned into an order (the mockup's Focus AI batch), dealt with. */
export const alertStatuses = ["open", "order", "done"] as const;
export type AlertStatus = (typeof alertStatuses)[number];

export const doorKinds = ["sectional", "freezer", "cold"] as const;
/** Sectionaaldeur, vriescel (−22 °C), koelcel (+2 °C). */
export type DoorKind = (typeof doorKinds)[number];

/** The comparison's periods: today against yesterday, this month against last month. */
export const periods = ["day", "month"] as const;
export type Period = (typeof periods)[number];

// --- Readings ---------------------------------------------------------------------------------

/** A zone's aggregate over one interval, from `start`. */
export interface Reading {
	start: Temporal.Instant;
	avgKw: number;
	peakKw: number;
	kwh: number;
}

/** Whether a zone whose latest reading started at `latest` (or never) is offline at `now`. */
export function isOffline(latest: Temporal.Instant | null | undefined, now: Temporal.Instant) {
	if (!latest) return true;
	const ended = latest.add({ minutes: INTERVAL_MINUTES });
	return now.since(ended).total("minutes") > OFFLINE_AFTER_MINUTES;
}

/** A zone's live power: its latest interval's average, or 0 while it's offline. */
export const liveKw = (latest: Reading | null | undefined, now: Temporal.Instant) =>
	!latest || isOffline(latest.start, now) ? 0 : latest.avgKw;

/** The consumption over readings, in kWh. */
export const totalKwh = (readings: readonly { kwh: number }[]) =>
	readings.reduce((sum, reading) => sum + reading.kwh, 0);

/** The highest peak over readings, in kW (0 without any). */
export const highestKw = (readings: readonly { peakKw: number }[]) =>
	readings.reduce((max, reading) => Math.max(max, reading.peakKw), 0);

// --- The comparison with the previous period ----------------------------------------------------

/** How `current` compares with `previous`, in percent; null without a previous value. */
export const changePercent = (current: number, previous: number): number | null =>
	previous > 0 ? ((current - previous) / previous) * 100 : null;

/**
 * The comparison of several zones with the previous period (§2.5's R): each zone's change,
 * weighted by its consumption now, `R = Σ(Δz × kWh z) / Σ kWh z`. Zones without a previous value
 * have no change and don't count; null when none has one.
 */
export function weightedChange(zones: readonly { current: number; previous: number }[]) {
	let weighted = 0;
	let weight = 0;
	for (const { current, previous } of zones) {
		const change = changePercent(current, previous);
		if (change === null) continue;
		weighted += change * current;
		weight += current;
	}
	return weight > 0 ? weighted / weight : null;
}

// --- Cost and CO₂ -------------------------------------------------------------------------------

/** What `kwh` costs at `tariff` (€/kWh), in cents. */
export const costCents = (kwh: number, tariff: number) => Math.round(kwh * tariff * 100);

/** The CO₂ of `kwh` at `factor` (kg/kWh), in kg. */
export const co2Kg = (kwh: number, factor: number) => kwh * factor;

// --- Thresholds ---------------------------------------------------------------------------------

/** A zone's alert thresholds: max power (kW) and consumption per day (kWh), and whether on. */
interface Threshold {
	enabled: boolean;
	maxKw: number;
	maxKwh: number;
}

/** §2.5's default factor by how a zone typically runs: 0.95 at peak, 1.08 elevated, else 1.3. */
const thresholdFactor = (tone: ZoneTone) =>
	tone === "peak" ? 0.95 : tone === "elevated" ? 1.08 : 1.3;

/**
 * A zone's default thresholds from its typical day (§2.5): `maxKw = round(peak kW × f)` and
 * `maxKwh = round(kWh per day × f)`, on unless the zone is offline.
 */
export function defaultThreshold(typical: { tone: ZoneTone; peakKw: number; kwh: number }) {
	const factor = thresholdFactor(typical.tone);
	return {
		enabled: typical.tone !== "offline",
		maxKw: Math.round(typical.peakKw * factor),
		maxKwh: Math.round(typical.kwh * factor),
	} satisfies Threshold;
}

/** A zone's readings give it default thresholds once they span this long (§2.5's typical day). */
const TYPICAL_DAY_HOURS = 24;

/**
 * The default thresholds of a zone that has none yet (one set up in the office), from its readings
 * (in any order, the zone's first among them): none until they span a day, from the first's start
 * to the last's end; then §2.5's from that last day's peak and consumption, as a zone that runs
 * nominally (one without thresholds has no state to say otherwise, so the factor is 1.3). None for
 * a day without consumption, which says nothing about the zone.
 */
export function firstDayThreshold(readings: readonly Reading[]) {
	if (!readings.length) return null;
	const sorted = readings.toSorted((a, b) => Temporal.Instant.compare(a.start, b.start));
	const end = sorted.at(-1)!.start.add({ minutes: INTERVAL_MINUTES });
	if (end.since(sorted[0].start).total("hours") < TYPICAL_DAY_HOURS) return null;
	const from = end.subtract({ hours: TYPICAL_DAY_HOURS });
	const day = sorted.filter((reading) => Temporal.Instant.compare(reading.start, from) >= 0);
	const kwh = totalKwh(day);
	if (kwh <= 0) return null;
	return defaultThreshold({ tone: "nominal", peakKw: highestKw(day), kwh });
}

/** How a zone's power and today's consumption compare with its thresholds: the larger share. */
export function thresholdRatio(load: { kw: number; kwh: number }, threshold: Threshold) {
	const power = threshold.maxKw > 0 ? load.kw / threshold.maxKw : 0;
	const energy = threshold.maxKwh > 0 ? load.kwh / threshold.maxKwh : 0;
	return {
		ratio: Math.max(power, energy),
		metric: (energy > power ? "energy" : "power") as "power" | "energy",
	};
}

/** The state of a ratio (§2.5): over at 1, near at 0.85; `off` for thresholds that aren't on. */
export function thresholdState(ratio: number, enabled: boolean): ThresholdState {
	if (!enabled) return "off";
	if (ratio >= 1) return "active";
	if (ratio >= NEAR_RATIO) return "near";
	return "normal";
}

/** A zone's tone: offline without recent readings, else peak over its thresholds, elevated near them. */
export function zoneTone(offline: boolean, state: ThresholdState): ZoneTone {
	if (offline) return "offline";
	return state === "active" ? "peak" : state === "near" ? "elevated" : "nominal";
}

// --- Doors --------------------------------------------------------------------------------------

/** A door's event: it opened or closed at `at`. */
interface DoorEvent {
	at: Temporal.Instant;
	open: boolean;
}

/** A time a door was open: closed at `closedAt`, or still open (null). */
export interface Opening {
	openedAt: Temporal.Instant;
	closedAt: Temporal.Instant | null;
}

/**
 * A door's openings from its events (in any order): each open up to the next close; a second
 * open while open, or a close while closed, changes nothing (a sensor that repeats itself).
 */
export function openings(events: readonly DoorEvent[]): Opening[] {
	const sorted = events.toSorted((a, b) => Temporal.Instant.compare(a.at, b.at));
	const found: Opening[] = [];
	let current: Opening | null = null;
	for (const event of sorted) {
		if (event.open && !current) {
			current = { openedAt: event.at, closedAt: null };
			found.push(current);
		} else if (!event.open && current) {
			current.closedAt = event.at;
			current = null;
		}
	}
	return found;
}

/** How long an opening lasted until `now`, in minutes (to its close, or to `now` if still open). */
export const openMinutes = (opening: Opening, now: Temporal.Instant) =>
	Math.max(0, (opening.closedAt ?? now).since(opening.openedAt).total("minutes"));

/**
 * How long a door was open between `from` and `to` (both moments, `to` no later than now), in
 * minutes: its openings clipped to the window, a still-open one counting up to `to`.
 */
export function minutesOpenBetween(
	doorOpenings: readonly Opening[],
	from: Temporal.Instant,
	to: Temporal.Instant,
) {
	let minutes = 0;
	for (const opening of doorOpenings) {
		const start = Temporal.Instant.compare(opening.openedAt, from) > 0 ? opening.openedAt : from;
		const close = opening.closedAt ?? to;
		const end = Temporal.Instant.compare(close, to) < 0 ? close : to;
		if (Temporal.Instant.compare(end, start) > 0) minutes += end.since(start).total("minutes");
	}
	return minutes;
}

/** The energy lost through an open door (§4.2): `open minutes / 60 × loss kW`, in kWh. */
export const doorLossKwh = (minutesOpen: number, lossKw: number) => (minutesOpen / 60) * lossKw;

/** Whether an open door is over its threshold: open at least that many minutes ("Te lang open"). */
export const isOverdue = (minutesOpen: number, thresholdMinutes: number) =>
	minutesOpen >= thresholdMinutes;

// --- Alerts -------------------------------------------------------------------------------------

/**
 * A zone's interval as the evaluation reads it: its average power and the zone's consumption that
 * day up to its end, with the hour it's in (the site's local hour, `yyyy-mm-ddThh`), which keys
 * the alert.
 */
export interface ZoneInterval {
	start: Temporal.Instant;
	hour: string;
	kw: number;
	kwhToday: number;
}

/** A breach of a threshold, before it's an alert. */
export interface Breach {
	/** What dedupes it: at most one alert per zone and hour, and per door opening. */
	key: string;
	metric: AlertMetric;
	severity: AlertSeverity;
	threshold: number;
	measured: number;
	at: Temporal.Instant;
}

/** The key of a zone's alert: one per zone per (local) hour (§2.5's zone, day, hour). */
export const zoneAlertKey = (zoneId: number, hour: string) => `zone:${zoneId}:${hour}`;

/** The key of a door's alert: one per opening (§2.5's door, day, opening cycle). */
export const doorAlertKey = (doorId: number, openedAt: Temporal.Instant) =>
	`door:${doorId}:${openedAt.epochMilliseconds / 1000}`;

const severityOf = (state: ThresholdState): AlertSeverity | null =>
	state === "active" ? "active" : state === "near" ? "near" : null;

/**
 * A zone's breaches over intervals: per hour the worst interval that's over (`active`) or near its
 * thresholds, as one breach of the metric that's furthest; nothing while the thresholds are off.
 */
export function zoneBreaches(
	zoneId: number,
	intervals: readonly ZoneInterval[],
	threshold: Threshold,
): Breach[] {
	if (!threshold.enabled) return [];
	const worst = new Map<string, { ratio: number; breach: Breach }>();
	for (const interval of intervals) {
		const { ratio, metric } = thresholdRatio(
			{ kw: interval.kw, kwh: interval.kwhToday },
			threshold,
		);
		const severity = severityOf(thresholdState(ratio, true));
		if (!severity) continue;
		const seen = worst.get(interval.hour);
		if (seen && seen.ratio >= ratio) continue;
		worst.set(interval.hour, {
			ratio,
			breach: {
				key: zoneAlertKey(zoneId, interval.hour),
				metric,
				severity,
				threshold: metric === "power" ? threshold.maxKw : threshold.maxKwh,
				measured: metric === "power" ? interval.kw : interval.kwhToday,
				at: interval.start,
			},
		});
	}
	return [...worst.values()].map(({ breach }) => breach);
}

/**
 * A door's breaches: each opening that lasted (or, still open, has lasted until `now`) at least
 * its threshold, measured in minutes open (§2.5's "Te lang open"). Always `active`.
 */
export function doorBreaches(
	doorId: number,
	doorOpenings: readonly Opening[],
	thresholdMinutes: number,
	now: Temporal.Instant,
): Breach[] {
	return doorOpenings.flatMap((opening) => {
		const minutes = openMinutes(opening, now);
		if (!isOverdue(minutes, thresholdMinutes)) return [];
		return [
			{
				key: doorAlertKey(doorId, opening.openedAt),
				metric: "door" as const,
				severity: "active" as const,
				threshold: thresholdMinutes,
				measured: minutes,
				at: opening.openedAt,
			},
		];
	});
}

// --- Savings advice -----------------------------------------------------------------------------

/** §2.5: shifting the peak to 12:00–15:00 lowers it by about `max(4, peak kW × 0.08)` kW. */
export const peakShiftKw = (peakKw: number) => Math.max(4, peakKw * 0.08);

/** §2.5: a night mode for climate and lighting saves about `kWh × 0.045`. */
export const nightModeKwh = (kwh: number) => kwh * 0.045;
