/**
 * What the site's page works out of its figures beside the KPIs: where the readings are in the
 * period, the consumption chart's measured, current and projected bars, the selection's
 * installations and its signals.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	consumptionBars,
	installationsOf,
	measuredSoFar,
	readingsUntil,
	signalsOf,
} from "#modules/energy/overview/scope.ts";
import type { ZoneFigures } from "#modules/energy/server/figures.ts";
import { at } from "#unit/temporal-support.ts";

const timeZone = "Europe/Amsterdam";
const midnight = Temporal.ZonedDateTime.from("2026-10-14T00:00[Europe/Amsterdam]").toInstant();

describe("measuredSoFar", () => {
	test("is the hour the readings end in and how far into it, for a day", () => {
		const until = Temporal.ZonedDateTime.from("2026-10-14T09:45[Europe/Amsterdam]").toInstant();
		expect(measuredSoFar("hour", midnight, until, timeZone)).toEqual({ index: 9, fraction: 0.75 });
	});

	test("is the day and the share of it, for a month", () => {
		const first = Temporal.ZonedDateTime.from("2026-10-01T00:00[Europe/Amsterdam]").toInstant();
		const until = Temporal.ZonedDateTime.from("2026-10-14T12:00[Europe/Amsterdam]").toInstant();
		expect(measuredSoFar("day", first, until, timeZone)).toEqual({ index: 13, fraction: 0.5 });
	});

	test("is before the first bucket without readings in the period", () => {
		expect(measuredSoFar("hour", midnight, null, timeZone).index).toBe(-1);
		expect(measuredSoFar("hour", midnight, midnight.subtract({ hours: 1 }), timeZone).index).toBe(
			-1,
		);
	});
});

describe("consumptionBars", () => {
	const previous = [10, 10, 20, 20];

	test("measures the past buckets, the current one partly, and projects the rest", () => {
		const bars = consumptionBars([10, 10, 6], previous, { index: 2, fraction: 0.5 });
		expect(bars.map((bar) => bar.state)).toEqual(["measured", "measured", "current", "remaining"]);
		expect(bars[0]).toEqual({ measured: 10, expected: 10, previous: 10, state: "measured" });
		// Half the hour in: its own pace, 6 an half hour, 12 the hour.
		expect(bars[2].expected).toBe(12);
		// This period as the previous one so far (26 against 30): the rest scaled by it.
		expect(bars[3].measured).toBe(0);
		expect(bars[3].expected).toBeCloseTo(20 * (26 / 30));
	});

	test("projects the current bucket from the previous period until it's a quarter in", () => {
		const bars = consumptionBars([10, 1], previous, { index: 1, fraction: 0.1 });
		expect(bars[1].state).toBe("current");
		expect(bars[1].expected).toBeGreaterThan(1);
		expect(bars[1].expected).toBeLessThanOrEqual(10 * 1.6);
	});

	test("keeps the trend between 0.6 and 1.6", () => {
		const high = consumptionBars([100], [10, 10], { index: 0, fraction: 1 });
		expect(high[1].expected).toBeCloseTo(16);
		const low = consumptionBars([1], [10, 10], { index: 0, fraction: 1 });
		expect(low[1].expected).toBeCloseTo(6);
	});

	test("is all still to measure before the first reading", () => {
		const bars = consumptionBars([], previous, { index: -1, fraction: 1 });
		expect(bars.every((bar) => bar.state === "remaining")).toBe(true);
		expect(bars.map((bar) => bar.expected)).toEqual(previous);
	});
});

test("readingsUntil is the end of the newest interval in", () => {
	expect(readingsUntil([{ latestAt: null }])).toBeNull();
	expect(
		readingsUntil([{ latestAt: at("2026-10-14 09:15") }, { latestAt: at("2026-10-14 09:30") }]),
	).toEqual(at("2026-10-14 09:45"));
});

test("installationsOf shares each zone's live power by rated power, the most first", () => {
	const zones = [
		{ id: 1, liveKw: 100 },
		{ id: 2, liveKw: 10 },
	];
	const consumers = [
		{ id: 1, zoneId: 1, name: "Vulautomaat", ratedKw: 75 },
		{ id: 2, zoneId: 1, name: "Inpakrobot", ratedKw: 25 },
		{ id: 3, zoneId: 2, name: "Serverrack", ratedKw: 40 },
		{ id: 4, zoneId: 3, name: "Elsewhere", ratedKw: 99 },
	];
	expect(installationsOf(zones, consumers).map(({ name, kwNow }) => [name, kwNow])).toEqual([
		["Vulautomaat", 75],
		["Inpakrobot", 25],
		["Serverrack", 10],
	]);
	expect(installationsOf(zones, consumers, 1)).toHaveLength(1);
});

test("signalsOf lists zones over their thresholds, doors open too long, then zones near them", () => {
	const zone = (id: number, state: ZoneFigures["state"], ratio: number) =>
		({ id, name: `Zone ${id}`, state, ratio }) as ZoneFigures;
	const zones = [zone(1, "near", 0.9), zone(2, "active", 1.2), zone(3, "normal", 0.2)];
	const doors = [
		{ id: 7, name: "Vriescel A", overdue: true, minutesOpen: 12 },
		{ id: 8, name: "Koelcel B", overdue: false, minutesOpen: 0 },
	];
	expect(signalsOf(zones, doors).map((signal) => [signal.name, signal.kind])).toEqual([
		["Zone 2", "over"],
		["Vriescel A", "door"],
		["Zone 1", "near"],
	]);
	expect(signalsOf([zone(3, "normal", 0.2)], [])).toEqual([]);
});
