/**
 * The energy module's rules against `docs/plans/shltr-domain.md` §2.5: live power and consumption
 * from the 15-minute aggregates, the weighted comparison R, cost and CO₂ at the mockup's tariff and
 * factor, door loss, the default thresholds, the alert states, and when a zone or a door raises an
 * alert.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	changePercent,
	co2Kg,
	costCents,
	DEFAULT_CO2_FACTOR,
	DEFAULT_TARIFF,
	defaultThreshold,
	doorAlertKey,
	doorBreaches,
	doorLossKwh,
	firstDayThreshold,
	floorLevel,
	floorsTopDown,
	highestKw,
	isOffline,
	liveKw,
	minutesOpenBetween,
	nightModeKwh,
	openings,
	openMinutes,
	peakShiftKw,
	solarEstimateKw,
	thresholdRatio,
	thresholdState,
	totalKwh,
	weightedChange,
	zoneAlertKey,
	zoneDayAlertKey,
	zoneBreaches,
	zoneTone,
} from "#modules/energy/model.ts";

/** A moment `minutes` after 08:00 UTC on a fixed day. */
const t = (minutes: number) => Temporal.Instant.from("2026-10-17T08:00:00Z").add({ minutes });

const reading = (minutes: number, avgKw: number, peakKw = avgKw) => ({
	start: t(minutes),
	avgKw,
	peakKw,
	kwh: avgKw / 4,
});

describe("readings", () => {
	test("a zone's live power is its latest interval's average, 0 once it's offline", () => {
		const latest = reading(0, 186.4);
		// The interval ended at 08:15; up to 30 minutes after that it's live.
		expect(liveKw(latest, t(20))).toBe(186.4);
		expect(liveKw(latest, t(45))).toBe(186.4);
		expect(liveKw(latest, t(46))).toBe(0);
		expect(liveKw(undefined, t(0))).toBe(0);
		expect(isOffline(null, t(0))).toBe(true);
		expect(isOffline(t(0), t(45))).toBe(false);
	});

	test("consumption adds the intervals' kWh up, the peak is the highest of their peaks", () => {
		const readings = [reading(0, 100, 120), reading(15, 200, 212), reading(30, 40, 44)];
		expect(totalKwh(readings)).toBe(25 + 50 + 10);
		expect(highestKw(readings)).toBe(212);
		expect(highestKw([])).toBe(0);
	});
});

describe("the comparison with the previous period", () => {
	test("a change in percent, none without a previous value", () => {
		expect(changePercent(112.8, 100)).toBeCloseTo(12.8);
		expect(changePercent(92.8, 100)).toBeCloseTo(-7.2);
		expect(changePercent(10, 0)).toBeNull();
	});

	test("R weighs each zone's change by its consumption now (§2.5's example zones)", () => {
		// Z-R61 +12.8 % at 1482 kWh, Z-TECH −7.2 % at 312 kWh, Z-IT +4.8 % at 512 kWh.
		const zones = [
			{ current: 1482, previous: 1482 / 1.128 },
			{ current: 312, previous: 312 / 0.928 },
			{ current: 512, previous: 512 / 1.048 },
		];
		const expected = (12.8 * 1482 - 7.2 * 312 + 4.8 * 512) / (1482 + 312 + 512);
		expect(weightedChange(zones)).toBeCloseTo(expected, 6);
	});

	test("zones without a previous value don't count; none at all is no change", () => {
		expect(
			weightedChange([
				{ current: 100, previous: 80 },
				{ current: 500, previous: 0 },
			]),
		).toBe(25);
		expect(weightedChange([{ current: 0, previous: 0 }])).toBeNull();
		expect(weightedChange([])).toBeNull();
	});
});

describe("cost, CO₂ and door loss", () => {
	test("cost is kWh × tariff, CO₂ kWh × factor (€ 0,28 and 0,375 kg by default)", () => {
		expect(costCents(1482, DEFAULT_TARIFF)).toBe(41496);
		expect(co2Kg(1482, DEFAULT_CO2_FACTOR)).toBeCloseTo(555.75);
	});

	test("door loss is open minutes / 60 × loss kW", () => {
		// D-05 open 14 minutes, 11.4 kW lost while open.
		expect(doorLossKwh(14, 11.4)).toBeCloseTo(2.66);
		expect(doorLossKwh(0, 18.6)).toBe(0);
	});

	test("a door's openings, from events in any order, a repeated event changing nothing", () => {
		const found = openings([
			{ at: t(20), open: false },
			{ at: t(0), open: true },
			{ at: t(5), open: true },
			{ at: t(30), open: true },
			{ at: t(25), open: false },
		]);
		expect(found).toEqual([
			{ openedAt: t(0), closedAt: t(20) },
			{ openedAt: t(30), closedAt: null },
		]);
		expect(openMinutes(found[0], t(100))).toBe(20);
		expect(openMinutes(found[1], t(42))).toBe(12);
	});

	test("the minutes open in a window clip the openings, a still-open one up to its end", () => {
		const found = openings([
			{ at: t(-10), open: true },
			{ at: t(10), open: false },
			{ at: t(50), open: true },
		]);
		expect(minutesOpenBetween(found, t(0), t(60))).toBe(10 + 10);
		expect(minutesOpenBetween(found, t(20), t(40))).toBe(0);
	});
});

describe("thresholds", () => {
	test("the defaults are the typical day's peak and kWh × 0.95, 1.08 or 1.3, on unless offline", () => {
		expect(defaultThreshold({ tone: "peak", peakKw: 212, kwh: 1482 })).toEqual({
			enabled: true,
			maxKw: 201,
			maxKwh: 1408,
		});
		expect(defaultThreshold({ tone: "elevated", peakKw: 118, kwh: 742 })).toEqual({
			enabled: true,
			maxKw: 127,
			maxKwh: 801,
		});
		expect(defaultThreshold({ tone: "nominal", peakKw: 44, kwh: 312 })).toEqual({
			enabled: true,
			maxKw: 57,
			maxKwh: 406,
		});
		expect(defaultThreshold({ tone: "offline", peakKw: 0, kwh: 0 }).enabled).toBe(false);
	});

	test("a new zone's are none until its readings span a day, then the defaults of that last day, as nominal", () => {
		const quarters = (from: number, count: number, avgKw: number) =>
			Array.from({ length: count }, (_, i) => reading((from + i) * 15, avgKw));
		expect(firstDayThreshold([])).toBeNull();
		// 95 quarters: a day less 15 minutes.
		expect(firstDayThreshold(quarters(0, 95, 40))).toBeNull();
		// 96 quarters: the day, 96 × 10 kWh at 40 kW (× 1.3), in any order.
		expect(firstDayThreshold(quarters(0, 96, 40).toReversed())).toEqual({
			enabled: true,
			maxKw: 52,
			maxKwh: 1248,
		});
		// The first reading a week back, a gap, then a day: that last day counts, not the first.
		expect(firstDayThreshold([reading(-7 * 24 * 60, 500), ...quarters(0, 96, 40)])).toEqual({
			enabled: true,
			maxKw: 52,
			maxKwh: 1248,
		});
		// A day without consumption says nothing.
		expect(firstDayThreshold(quarters(0, 96, 0))).toBeNull();
	});

	test("the ratio is the larger of power and consumption against their max", () => {
		const threshold = { enabled: true, maxKw: 200, maxKwh: 1000 };
		expect(thresholdRatio({ kw: 100, kwh: 900 }, threshold)).toEqual({
			ratio: 0.9,
			metric: "energy",
		});
		expect(thresholdRatio({ kw: 210, kwh: 100 }, threshold)).toEqual({
			ratio: 1.05,
			metric: "power",
		});
	});

	test("over at 1, near at 0.85, normal below, off when switched off", () => {
		expect(thresholdState(1, true)).toBe("active");
		expect(thresholdState(0.85, true)).toBe("near");
		expect(thresholdState(0.849, true)).toBe("normal");
		expect(thresholdState(2, false)).toBe("off");
	});

	test("a zone's tone follows its state, offline first", () => {
		expect(zoneTone(false, "active")).toBe("peak");
		expect(zoneTone(false, "near")).toBe("elevated");
		expect(zoneTone(false, "normal")).toBe("nominal");
		expect(zoneTone(false, "off")).toBe("nominal");
		expect(zoneTone(true, "active")).toBe("offline");
	});
});

describe("alerts", () => {
	const threshold = { enabled: true, maxKw: 200, maxKwh: 10_000 };
	const interval = (minutes: number, kw: number, hour: string, kwhToday = 0) => ({
		start: t(minutes),
		day: hour.slice(0, 10),
		hour,
		kw,
		kwhToday,
	});

	test("a zone's power raises one alert per hour: the worst interval over or near its max", () => {
		const breaches = zoneBreaches(
			7,
			[
				interval(0, 180, "2026-10-17T10"),
				interval(15, 210, "2026-10-17T10"),
				interval(30, 205, "2026-10-17T10"),
				interval(60, 150, "2026-10-17T11"),
				interval(75, 171, "2026-10-17T11"),
			],
			threshold,
		);
		expect(breaches).toEqual([
			{
				key: zoneAlertKey(7, "2026-10-17T10"),
				metric: "power",
				severity: "active",
				threshold: 200,
				measured: 210,
				at: t(15),
			},
			{
				key: "zone:7:2026-10-17T11",
				metric: "power",
				severity: "near",
				threshold: 200,
				measured: 171,
				at: t(75),
			},
		]);
	});

	test("consumption counts up to the interval, against the day's max", () => {
		const [breach] = zoneBreaches(1, [interval(0, 10, "2026-10-17T21", 1450)], {
			enabled: true,
			maxKw: 201,
			maxKwh: 1408,
		});
		expect(breach).toMatchObject({ metric: "energy", severity: "active", measured: 1450 });
	});

	test("a zone's consumption raises one alert per day, its latest interval, beside its power", () => {
		const breaches = zoneBreaches(
			7,
			[
				interval(0, 100, "2026-10-17T10", 8_600),
				interval(60, 210, "2026-10-17T11", 9_900),
				interval(120, 100, "2026-10-17T12", 10_200),
				interval(24 * 60, 100, "2026-10-18T10", 9_000),
			],
			threshold,
		);
		expect(breaches).toEqual([
			{
				key: zoneDayAlertKey(7, "2026-10-17"),
				metric: "energy",
				severity: "active",
				threshold: 10_000,
				measured: 10_200,
				at: t(120),
			},
			{
				key: zoneAlertKey(7, "2026-10-17T11"),
				metric: "power",
				severity: "active",
				threshold: 200,
				measured: 210,
				at: t(60),
			},
			{
				key: "zone:7:2026-10-18",
				metric: "energy",
				severity: "near",
				threshold: 10_000,
				measured: 9_000,
				at: t(24 * 60),
			},
		]);
	});

	test("nothing while the thresholds are off", () => {
		expect(
			zoneBreaches(1, [interval(0, 999, "2026-10-17T10", 999)], {
				enabled: false,
				maxKw: 1,
				maxKwh: 1,
			}),
		).toEqual([]);
	});

	test("a door raises one alert per opening that lasted its threshold, still open up to now", () => {
		const found = openings([
			{ at: t(0), open: true },
			{ at: t(6), open: false },
			{ at: t(20), open: true },
			{ at: t(34), open: false },
			{ at: t(50), open: true },
		]);
		const breaches = doorBreaches(3, found, 10, t(61));
		expect(breaches).toEqual([
			{
				key: doorAlertKey(3, t(20)),
				metric: "door",
				severity: "active",
				threshold: 10,
				measured: 14,
				at: t(20),
			},
			{
				key: doorAlertKey(3, t(50)),
				metric: "door",
				severity: "active",
				threshold: 10,
				measured: 11,
				at: t(50),
			},
		]);
		// The same opening, later: the same key, so the same alert.
		expect(doorBreaches(3, found, 10, t(70))[1].key).toBe(breaches[1].key);
	});
});

describe("savings advice", () => {
	test("shifting the peak saves max(4, kW × 0.08), night mode kWh × 0.045", () => {
		expect(peakShiftKw(212)).toBeCloseTo(16.96);
		expect(peakShiftKw(31)).toBe(4);
		expect(nightModeKwh(1482)).toBeCloseTo(66.69);
	});
});

describe("the building", () => {
	test("reads a floor's level from its name", () => {
		expect(floorLevel("1e verdieping")).toBe(1);
		expect(floorLevel("2nd floor")).toBe(2);
		expect(floorLevel("Begane grond")).toBe(0);
		expect(floorLevel("Ground floor")).toBe(0);
		expect(floorLevel("Kelder")).toBe(-1);
		expect(floorLevel("Kelder 2")).toBe(-2);
		expect(floorLevel("Mezzanine")).toBeNull();
	});

	test("stacks the floors as a plan draws them, the top one first", () => {
		expect(floorsTopDown(["Begane grond", "1e verdieping", "Kelder"])).toEqual([
			"1e verdieping",
			"Begane grond",
			"Kelder",
		]);
		// A floor whose name says nothing is as high as the ground floor, in its own order.
		expect(floorsTopDown(["Kelder", "Hal", "Begane grond"])).toEqual([
			"Hal",
			"Begane grond",
			"Kelder",
		]);
	});

	test("estimates the solar panels: nothing at night, the most around midday, more in summer", () => {
		const at = (text: string) => Temporal.ZonedDateTime.from(`${text}[Europe/Amsterdam]`);
		expect(solarEstimateKw(18.2, at("2026-10-17T02:00"))).toBe(0);
		expect(solarEstimateKw(18.2, at("2026-10-17T21:00"))).toBe(0);
		const noon = solarEstimateKw(18.2, at("2026-10-17T13:30"));
		expect(noon).toBeGreaterThan(solarEstimateKw(18.2, at("2026-10-17T10:00")));
		expect(noon).toBeLessThan(18.2);
		expect(solarEstimateKw(18.2, at("2026-06-21T13:30"))).toBeGreaterThan(noon);
		expect(solarEstimateKw(18.2, at("2026-12-21T13:30"))).toBeLessThan(noon);
	});
});
