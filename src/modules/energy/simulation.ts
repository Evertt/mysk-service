/**
 * A building's meters and door sensors, made up: a day's readings per zone per 15 minutes and its
 * door events, as a gateway would post them (`ingest/format.ts`). The seed fills a site's history
 * with it, and the simulator (`server/simulator.ts`) posts a day to a running app. Its shape is
 * §2.5's: a working day's hourly profile, weekday factors (Sunday 0.42, Saturday 0.58, ±5 %
 * noise per day), ±3.5 % noise per interval, and doors that open in cycles, now and then too long.
 * Deterministic: the same seed and day give the same data, so posting a seeded day again changes
 * nothing. Pure, plain Node too (no SvelteKit, no messages).
 */
import { INTERVAL_MINUTES } from "./model.ts";

/** A zone as the simulation runs it: its typical working day's peak and consumption. */
export interface SimulatedZone {
	code: string;
	peakKw: number;
	kwhPerDay: number;
	/** Sends nothing (`Z-EXP`, the external unit). */
	offline?: boolean;
}

/** A door as the simulation opens it. */
export interface SimulatedDoor {
	code: string;
	/** Minutes from one opening to the next, and how long each lasts. */
	cycleMinutes: number;
	openMinutes: number;
	/** Where in the day its cycle starts (minutes). */
	offsetMinutes: number;
	/** The hours it's used, e.g. 6 to 22. */
	fromHour: number;
	toHour: number;
	/** How often an opening lasts too long, and how much longer it then is (minutes). */
	overrunChance: number;
	overrunMinutes: number;
}

interface SimulatedReading {
	zone: string;
	start: Temporal.Instant;
	avgKw: number;
	peakKw: number;
	kwh: number;
}

interface SimulatedDoorEvent {
	door: string;
	at: Temporal.Instant;
	open: boolean;
}

/**
 * The working day's hourly profile, its peak 1: quiet at night, the morning's peak at 10:00, a
 * dip at lunch, a second peak at 14:00, winding down after 17:00.
 */
const hourWeights = [
	0.03, 0.03, 0.03, 0.03, 0.03, 0.05, 0.15, 0.45, 0.7, 0.9, 1, 0.85, 0.45, 0.6, 0.75, 0.6, 0.4, 0.2,
	0.1, 0.05, 0.04, 0.04, 0.04, 0.03,
];

const meanWeight = hourWeights.reduce((sum, weight) => sum + weight, 0) / hourWeights.length;

/** §2.5's weekday factors: Sunday 0.42, Saturday 0.58, else 1 (Monday is 1 in Temporal). */
const weekdayFactor = (dayOfWeek: number) => (dayOfWeek === 7 ? 0.42 : dayOfWeek === 6 ? 0.58 : 1);

/** A fast, seedable random number generator (mulberry32): numbers in [0, 1). */
function random(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** A seed for one thing on one day, from the run's seed: the same every time. */
function seedOf(seed: number, ...parts: string[]) {
	let hash = seed >>> 0;
	for (const char of parts.join("|")) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
	return hash;
}

/**
 * A zone's share of its peak at an hour of a working day (fractional hours in between): the
 * profile scaled so that a working day uses about `kwhPerDay`. A zone that runs more evenly than
 * the profile (a server room) gets a base load under it instead.
 */
function shareAt(zone: SimulatedZone, hour: number) {
	const low = Math.floor(hour) % 24;
	const high = (low + 1) % 24;
	const weight =
		hourWeights[low] + (hourWeights[high] - hourWeights[low]) * (hour - Math.floor(hour));
	const target = zone.kwhPerDay / (24 * zone.peakKw);
	if (target <= meanWeight) return (weight * target) / meanWeight;
	const base = Math.min(1, (target - meanWeight) / (1 - meanWeight));
	return base + (1 - base) * weight;
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));

/** `day`'s readings and door events at a site, in `timeZone`, up to `until` (complete intervals). */
export function simulateDay(options: {
	zones: readonly SimulatedZone[];
	doors: readonly SimulatedDoor[];
	day: Temporal.PlainDate;
	timeZone: string;
	seed: number;
	/** Leave out what happens after this (a reading's interval must have ended). */
	until?: Temporal.Instant;
}) {
	const { zones, doors, day, timeZone, seed, until } = options;
	const midnight = day.toZonedDateTime({ timeZone });
	const nextMidnight = day.add({ days: 1 }).toZonedDateTime({ timeZone });
	const end =
		until && Temporal.Instant.compare(until, nextMidnight.toInstant()) < 0
			? until
			: nextMidnight.toInstant();
	const dayFactor = weekdayFactor(day.dayOfWeek);
	const dayKey = day.toString();

	const readings: SimulatedReading[] = [];
	for (const zone of zones) {
		if (zone.offline || zone.peakKw <= 0) continue;
		const next = random(seedOf(seed, dayKey, zone.code));
		// ±5 % for the day, as §2.5 has it.
		const daily = dayFactor * (0.95 + next() * 0.1);
		for (
			let start = midnight;
			Temporal.ZonedDateTime.compare(start, nextMidnight) < 0;
			start = start.add({ minutes: INTERVAL_MINUTES })
		) {
			const ends = start.add({ minutes: INTERVAL_MINUTES }).toInstant();
			if (Temporal.Instant.compare(ends, end) > 0) break;
			const hour = start.hour + (start.minute + INTERVAL_MINUTES / 2) / 60;
			const avgKw = zone.peakKw * shareAt(zone, hour) * daily * (0.965 + next() * 0.07);
			const peakKw = avgKw * (1.01 + next() * 0.07);
			readings.push({
				zone: zone.code,
				start: start.toInstant(),
				avgKw: round(avgKw, 2),
				peakKw: round(peakKw, 2),
				kwh: round(avgKw / 4, 3),
			});
		}
	}

	const doorEvents: SimulatedDoorEvent[] = [];
	for (const door of doors) {
		const next = random(seedOf(seed, dayKey, door.code));
		for (
			let minute = door.fromHour * 60 + door.offsetMinutes;
			minute < door.toHour * 60;
			minute += door.cycleMinutes
		) {
			// Fewer openings on a quiet day; each a little early or late.
			if (next() > dayFactor) continue;
			const opens = minute + Math.round((next() - 0.5) * 6);
			const overrun = next() < door.overrunChance;
			const lasts = Math.max(
				1,
				door.openMinutes + (overrun ? door.overrunMinutes * (0.7 + next() * 0.6) : next() * 2 - 1),
			);
			const openedAt = midnight.add({ minutes: opens }).toInstant();
			const closedAt = openedAt.add({ seconds: Math.round(lasts * 60) });
			if (Temporal.Instant.compare(openedAt, end) > 0) break;
			doorEvents.push({ door: door.code, at: openedAt, open: true });
			if (Temporal.Instant.compare(closedAt, end) <= 0) {
				doorEvents.push({ door: door.code, at: closedAt, open: false });
			}
		}
	}
	return { readings, doorEvents };
}

// --- The live simulation ------------------------------------------------------------------------

/**
 * How much livelier a speed makes the live simulation: 1 at 1×, about 2.5 at 30×. It widens the
 * readings' noise, makes surges likelier and bigger, and has doors open more often and stay open
 * too long more often; the clock stays the real one.
 */
export const liveliness = (speed: number) => 1 + Math.log10(Math.max(1, speed)) * 1.05;

/** One draw for one thing, from the run's seed: the same every time. */
const draw = (seed: number, ...parts: (string | number)[]) =>
	random(seedOf(seed, ...parts.map(String)))();

/**
 * The readings of every interval that ends in `(from, to]`, per zone, as the gateway would post
 * them live: §2.5's working day (as `simulateDay()`'s), its noise widening with the speed, and now
 * and then a surge, an hour in which a zone draws 15 % to 60 % more (more often and more at a
 * higher speed), which takes a zone near or over its thresholds: the alerts a demo shows.
 * Deterministic for a seed, zone, interval and speed.
 */
export function simulateReadings(options: {
	zones: readonly SimulatedZone[];
	from: Temporal.Instant;
	to: Temporal.Instant;
	timeZone: string;
	seed: number;
	speed: number;
}): SimulatedReading[] {
	const { zones, from, to, timeZone, seed, speed } = options;
	const lively = liveliness(speed);
	const quarter = INTERVAL_MINUTES * 60;
	const fromSeconds = Math.floor(from.epochMilliseconds / 1000);
	const toSeconds = Math.floor(to.epochMilliseconds / 1000);
	const readings: SimulatedReading[] = [];
	// Every interval whose end is after `from` and no later than `to`.
	for (
		let start = Math.floor(fromSeconds / quarter) * quarter;
		start + quarter <= toSeconds;
		start += quarter
	) {
		if (start + quarter <= fromSeconds) continue;
		const instant = Temporal.Instant.fromEpochMilliseconds(start * 1000);
		const local = instant.toZonedDateTimeISO(timeZone);
		const day = local.toPlainDate().toString();
		const hour = local.hour + (local.minute + INTERVAL_MINUTES / 2) / 60;
		const surgeKey = `${day}T${local.hour}`;
		for (const zone of zones) {
			if (zone.offline || zone.peakKw <= 0) continue;
			const daily =
				weekdayFactor(local.dayOfWeek) * (0.95 + draw(seed, day, zone.code, "day") * 0.1);
			const share = shareAt(zone, hour);
			const surges =
				share >= 0.25 && draw(seed, surgeKey, zone.code, "surge") < Math.min(0.5, 0.05 * lively);
			const surge = surges
				? Math.min(1.6, 1.15 + draw(seed, surgeKey, zone.code, "size") * 0.18 * lively)
				: 1;
			const noise = 1 + (draw(seed, start, zone.code) - 0.5) * 0.07 * lively;
			const avgKw = round(zone.peakKw * share * daily * noise * surge, 2);
			const peakKw = round(
				avgKw * (1.01 + draw(seed, start, zone.code, "peak") * 0.07 * lively),
				2,
			);
			readings.push({ zone: zone.code, start: instant, avgKw, peakKw, kwh: round(avgKw / 4, 3) });
		}
	}
	return readings;
}

/** A door's latest event: open or closed since `since`. */
export interface DoorState {
	open: boolean;
	since: Temporal.Instant;
}

/**
 * How long a door's opening at `openedAt` lasts, in minutes: about its usual time, or, now and
 * then (more often at a higher speed), its overrun on top: the door left open too long.
 */
function openingMinutes(
	door: SimulatedDoor,
	openedAt: Temporal.Instant,
	seed: number,
	speed: number,
) {
	const key = openedAt.epochMilliseconds;
	const overruns =
		draw(seed, door.code, key, "overrun") < Math.min(0.5, door.overrunChance * liveliness(speed));
	const spread = draw(seed, door.code, key, "length");
	return overruns
		? door.openMinutes + door.overrunMinutes * (0.7 + spread * 0.6)
		: Math.max(1, door.openMinutes + spread * 2 - 1);
}

/** The first moment at or after `at` within the door's hours, in `timeZone`. */
function withinHours(door: SimulatedDoor, at: Temporal.Instant, timeZone: string) {
	const local = at.toZonedDateTimeISO(timeZone);
	const opens = local.startOfDay().add({ hours: door.fromHour });
	if (Temporal.ZonedDateTime.compare(local, opens) < 0) return opens.toInstant();
	if (local.hour >= door.toHour) return opens.add({ days: 1 }).toInstant();
	return at;
}

const later = (a: Temporal.Instant, b: Temporal.Instant) =>
	Temporal.Instant.compare(a, b) >= 0 ? a : b;

/**
 * A door's events in `(from, to]` as its sensor would send them live, going on from its `state`
 * (its latest event; closed since `from` without one): each opening lasts as `openingMinutes()`
 * says, the next follows after about its cycle (shorter at a higher speed) within its hours, and
 * what fell due in a pause before `from` happens just after it. Deterministic for a seed, state
 * and speed, so a tick that's repeated sends what's in already.
 */
export function simulateDoorEvents(options: {
	door: SimulatedDoor;
	state: DoorState | null;
	from: Temporal.Instant;
	to: Temporal.Instant;
	timeZone: string;
	seed: number;
	speed: number;
}): SimulatedDoorEvent[] {
	const { door, from, to, timeZone, seed, speed } = options;
	// In whole seconds, as moments are stored.
	const earliest = Temporal.Instant.fromEpochMilliseconds(
		(Math.floor(from.epochMilliseconds / 1000) + 1) * 1000,
	);
	const cycle = Math.max(3, door.cycleMinutes / liveliness(speed));
	let state = options.state ?? { open: false, since: from };
	const events: SimulatedDoorEvent[] = [];
	for (let guard = 0; guard < 100; guard++) {
		const gap = cycle * (0.7 + draw(seed, door.code, state.since.epochMilliseconds, "gap") * 0.6);
		const due = state.open
			? state.since.add({
					seconds: Math.round(openingMinutes(door, state.since, seed, speed) * 60),
				})
			: withinHours(door, state.since.add({ seconds: Math.round(gap * 60) }), timeZone);
		const at = later(later(due, earliest), state.since.add({ seconds: 1 }));
		if (Temporal.Instant.compare(at, to) > 0) break;
		state = { open: !state.open, since: at };
		events.push({ door: door.code, at, open: state.open });
	}
	return events;
}
