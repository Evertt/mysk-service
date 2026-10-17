/**
 * The live simulation (`simulation.ts`), which the demo's ticks post through the ingest: readings
 * for every interval a tick covers, as the gateway would send them; surges and wider swings at a
 * higher speed; doors that open and close in their hours, going on from their latest event, the
 * same however the time is split into ticks.
 */
import { describe, expect, test } from "vite-plus/test";

import { riedelDoors, riedelZones, SIMULATION_SEED } from "#modules/energy/server/riedel.ts";
import { simulateDoorEvents, simulateReadings } from "#modules/energy/simulation.ts";

const timeZone = "Europe/Amsterdam";
/** A moment on Wednesday 14 October 2026 in Amsterdam, `hh:mm`. */
const local = (time: string) =>
	Temporal.ZonedDateTime.from(`2026-10-14T${time}[Europe/Amsterdam]`).toInstant();
const seed = SIMULATION_SEED;

describe("simulateReadings", () => {
	test("gives each zone a reading of every interval that ends in the tick, none of the offline one", () => {
		const readings = simulateReadings({
			zones: riedelZones,
			from: local("08:07"),
			to: local("09:00"),
			timeZone,
			seed,
			speed: 1,
		});
		const starts = [...new Set(readings.map((reading) => reading.start.toString()))];
		expect(starts).toEqual(
			["08:00", "08:15", "08:30", "08:45"].map((time) => local(time).toString()),
		);
		expect(readings.some((reading) => reading.zone === "Z-EXP")).toBe(false);
		expect(readings).toHaveLength(4 * 7);
		for (const reading of readings) {
			expect(reading.peakKw).toBeGreaterThanOrEqual(reading.avgKw);
			// As the ingest checks it: kWh is avgKw / 4, give or take 2 %.
			expect(Math.abs(reading.kwh - reading.avgKw / 4)).toBeLessThanOrEqual(
				(reading.avgKw / 4) * 0.02 + 0.001,
			);
		}
	});

	test("is the same for the same interval, and nothing before an interval has ended", () => {
		const options = { zones: riedelZones, timeZone, seed, speed: 5 };
		const once = simulateReadings({ ...options, from: local("10:00"), to: local("10:30") });
		const again = simulateReadings({ ...options, from: local("10:00"), to: local("10:30") });
		expect(again).toEqual(once);
		expect(simulateReadings({ ...options, from: local("10:01"), to: local("10:14") })).toEqual([]);
	});

	test("swings wider and surges more at a higher speed", () => {
		const day = (speed: number) =>
			simulateReadings({
				zones: riedelZones,
				from: local("00:00"),
				to: local("23:59"),
				timeZone,
				seed,
				speed,
			}).filter((reading) => reading.zone === "Z-R61");
		const highest = (speed: number) => Math.max(...day(speed).map((reading) => reading.avgKw));
		expect(highest(30)).toBeGreaterThan(highest(1));
	});
});

describe("simulateDoorEvents", () => {
	const door = riedelDoors.find((each) => each.code === "D-05")!;
	const options = { door, timeZone, seed, speed: 1 };

	test("opens and closes the door in turn, within the tick", () => {
		const from = local("08:00");
		const to = local("11:00");
		const events = simulateDoorEvents({ ...options, state: null, from, to });
		expect(events.length).toBeGreaterThan(4);
		events.forEach((event, i) => {
			expect(event.open).toBe(i % 2 === 0);
			expect(Temporal.Instant.compare(event.at, from)).toBe(1);
			expect(Temporal.Instant.compare(event.at, to)).toBeLessThanOrEqual(0);
		});
	});

	test("is the same however the time is split into ticks", () => {
		const whole = simulateDoorEvents({
			...options,
			state: null,
			from: local("08:00"),
			to: local("12:00"),
		});
		let state = null as { open: boolean; since: Temporal.Instant } | null;
		const split = [];
		for (const [from, to] of [
			["08:00", "09:10"],
			["09:10", "09:11"],
			["09:11", "12:00"],
		]) {
			const events = simulateDoorEvents({ ...options, state, from: local(from), to: local(to) });
			split.push(...events);
			const last = events.at(-1);
			if (last) state = { open: last.open, since: last.at };
			else state ??= { open: false, since: local("08:00") };
		}
		expect(split).toEqual(whole);
	});

	test("doesn't open outside the door's hours", () => {
		const night = simulateDoorEvents({
			...options,
			state: { open: false, since: local("22:30") },
			from: local("22:30"),
			to: Temporal.ZonedDateTime.from("2026-10-15T05:30[Europe/Amsterdam]").toInstant(),
		});
		expect(night).toEqual([]);
	});

	test("closes a door left open over a pause just after the tick starts", () => {
		const from = local("12:00");
		const events = simulateDoorEvents({
			...options,
			state: { open: true, since: local("09:00") },
			from,
			to: from.add({ seconds: 5 }),
		});
		expect(events[0]).toEqual({ door: "D-05", at: from.add({ seconds: 1 }), open: false });
	});

	test("leaves a door open too long now and then, more often at a higher speed", () => {
		const overruns = (speed: number) => {
			const events = simulateDoorEvents({
				...options,
				speed,
				state: null,
				from: local("06:00"),
				to: local("22:00"),
			});
			let count = 0;
			for (let i = 0; i + 1 < events.length; i += 2) {
				const minutes = events[i + 1].at.since(events[i].at).total("minutes");
				if (minutes >= door.thresholdMinutes) count++;
			}
			return count;
		};
		expect(overruns(30)).toBeGreaterThan(0);
		expect(overruns(30)).toBeGreaterThanOrEqual(overruns(1));
	});
});
