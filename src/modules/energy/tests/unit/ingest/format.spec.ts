/**
 * The ingest format (`docs/ingest.md`): a batch is taken as it's documented, and refused, with
 * where, for anything else: unknown fields, an interval off the quarter hour or not over yet, kWh
 * that doesn't match the average, a peak under it, an event in the future, the same thing twice.
 * The simulator's batches are in the format.
 */
import { describe, expect, test } from "vite-plus/test";

import { MAX_READINGS, parseBatch } from "#modules/energy/ingest/format.ts";
import { riedelDoors, riedelZones, SIMULATION_SEED } from "#modules/energy/server/riedel.ts";
import { simulateDay } from "#modules/energy/simulation.ts";

const now = Temporal.Instant.from("2026-10-17T12:07:00Z");

const valid = {
	site: 1,
	readings: [
		{ zone: "Z-R61", start: "2026-10-17T08:00:00Z", avgKw: 186.4, peakKw: 201.2, kwh: 46.6 },
		{ zone: "Z-R61", start: "2026-10-17T09:00:00+02:00", avgKw: 10, peakKw: 10, kwh: 2.5 },
	],
	doorEvents: [
		{ door: "D-05", at: "2026-10-17T08:03:12Z", state: "open" },
		{ door: "D-05", at: "2026-10-17T08:17:40Z", state: "closed" },
	],
};

const issuesOf = (body: unknown) => parseBatch(body, now).issues ?? [];

describe("a batch", () => {
	test("as documented is taken, with its moments as moments", () => {
		const { batch } = parseBatch(valid, now);
		expect(batch?.readings[1].start).toEqual(Temporal.Instant.from("2026-10-17T07:00:00Z"));
		expect(batch?.doorEvents.map((e) => e.state)).toEqual(["open", "closed"]);
		expect(parseBatch({ site: 1, doorEvents: valid.doorEvents }, now).batch?.readings).toEqual([]);
	});

	test("needs a site and at least one reading or event", () => {
		expect(issuesOf({ readings: valid.readings })).toHaveLength(1);
		expect(issuesOf({ site: 1 })).toEqual(["A batch has at least one reading or door event"]);
		expect(issuesOf({ site: 1.5, readings: valid.readings })[0]).toMatch(/^site:/);
	});

	test("refuses fields it doesn't know, at the batch and in its readings", () => {
		expect(issuesOf({ ...valid, meter: "x" })).toEqual(["meter: Unknown field"]);
		expect(issuesOf({ site: 1, readings: [{ ...valid.readings[0], voltage: 230 }] })).toEqual([
			"readings[0].voltage: Unknown field",
		]);
	});

	test("takes intervals on a quarter hour only, that have ended, at most 90 days ago", () => {
		const at = (start: string) => ({ site: 1, readings: [{ ...valid.readings[0], start }] });
		expect(issuesOf(at("2026-10-17T08:05:00Z"))[0]).toMatch(/^readings\[0\]\.start: An interval/);
		expect(issuesOf(at("2026-10-17T08:00:30Z"))).toHaveLength(1);
		expect(issuesOf(at("2026-10-17T12:00:00Z"))).toEqual([
			"readings[0].start: The interval hasn't ended yet",
		]);
		expect(issuesOf(at("2026-10-17T11:45:00Z"))).toEqual([]);
		expect(issuesOf(at("2026-07-01T08:00:00Z"))).toEqual([
			"readings[0].start: More than 90 days ago",
		]);
		expect(issuesOf(at("2026-10-17 08:00"))[0]).toMatch(/ISO 8601/);
	});

	test("holds kWh to the average over the quarter hour and the peak above the average", () => {
		const with_ = (fields: object) => ({
			site: 1,
			readings: [{ ...valid.readings[0], ...fields }],
		});
		expect(issuesOf(with_({ kwh: 46.6 * 1.019 }))).toEqual([]);
		expect(issuesOf(with_({ kwh: 50 }))[0]).toMatch(/kWh doesn't match/);
		expect(issuesOf(with_({ peakKw: 180 }))).toEqual([
			"readings[0]: The peak is below the average",
		]);
		expect(issuesOf(with_({ avgKw: -1, kwh: 0 }))[0]).toMatch(/^readings\[0\]\.avgKw: Power/);
		expect(issuesOf(with_({ avgKw: Number.NaN }))[0]).toMatch(/avgKw/);
	});

	test("refuses door events in the future and states other than open and closed", () => {
		const event = (fields: object) => ({
			site: 1,
			doorEvents: [{ ...valid.doorEvents[0], ...fields }],
		});
		expect(issuesOf(event({ at: "2026-10-17T12:07:50Z" }))).toEqual([]);
		expect(issuesOf(event({ at: "2026-10-17T12:09:00Z" }))).toEqual([
			"doorEvents[0].at: In the future",
		]);
		expect(issuesOf(event({ state: "ajar" }))[0]).toMatch(/^doorEvents\[0\]\.state/);
	});

	test("refuses the same interval or event twice", () => {
		expect(
			issuesOf({ site: 1, readings: [valid.readings[0], { ...valid.readings[0], avgKw: 186.4 }] }),
		).toEqual(["readings[1]: In the batch twice"]);
		expect(issuesOf({ site: 1, doorEvents: [valid.doorEvents[0], valid.doorEvents[0]] })).toEqual([
			"doorEvents[1]: In the batch twice",
		]);
	});

	test("takes at most 2,000 readings", () => {
		const readings = Array.from({ length: MAX_READINGS + 1 }, (_, i) => ({
			...valid.readings[0],
			zone: `Z-${i}`,
		}));
		expect(issuesOf({ site: 1, readings })).toEqual(["readings: At most 2000 per batch"]);
	});
});

describe("the simulator's batches", () => {
	test("a day of Riedel Ede is in the format, the same every time", () => {
		const day = Temporal.PlainDate.from("2026-10-14");
		const until = Temporal.Instant.from("2026-10-16T00:00:00Z");
		const options = {
			zones: riedelZones,
			doors: riedelDoors,
			day,
			timeZone: "Europe/Amsterdam",
			seed: SIMULATION_SEED,
			until,
		};
		const simulated = simulateDay(options);
		// Seven zones send (the external unit is offline), 96 quarter hours each.
		expect(simulated.readings).toHaveLength(7 * 96);
		expect(simulated.doorEvents.length).toBeGreaterThan(100);
		expect(simulateDay(options)).toEqual(simulated);
		const body = JSON.parse(
			JSON.stringify({
				site: 1,
				readings: simulated.readings,
				doorEvents: simulated.doorEvents.map(({ door, at, open }) => ({
					door,
					at,
					state: open ? "open" : "closed",
				})),
			}),
		);
		expect(parseBatch(body, until).issues).toBeUndefined();
	});

	test("leaves out what hasn't happened yet", () => {
		const until = Temporal.Instant.from("2026-10-14T08:07:00Z");
		const { readings, doorEvents } = simulateDay({
			zones: riedelZones,
			doors: riedelDoors,
			day: Temporal.PlainDate.from("2026-10-14"),
			timeZone: "Europe/Amsterdam",
			seed: SIMULATION_SEED,
			until,
		});
		// 00:00 to 10:00 in Amsterdam (UTC+2) is 40 quarter hours, the last one ending at 08:00 UTC.
		expect(readings).toHaveLength(7 * 40);
		expect(doorEvents.every((e) => Temporal.Instant.compare(e.at, until) <= 0)).toBe(true);
	});
});
