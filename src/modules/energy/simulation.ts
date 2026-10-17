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
