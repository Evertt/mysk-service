/**
 * The periods a site's figures compare: this month's days against last month's, day N against day
 * N, its sums to the same day and time of last month (by the clock on the wall, across a change to
 * or from summer time), and today against yesterday to the same time; the sums of the previous
 * period only as far as this one's readings have come in. And a door's openings, also one that
 * began long before the period. On Riedel's site, with readings and events of 2030.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	loadSite,
	periodRanges,
	reportRanges,
	siteFigures,
} from "#modules/energy/server/figures.ts";
import { as, rows, shltr } from "#unit/lib/server/harness/index.ts";

import { riedel, shltrId } from "./energy.test-support.ts";

const timeZone = "Europe/Amsterdam";
const at = (moment: string) =>
	Temporal.PlainDateTime.from(moment).toZonedDateTime(timeZone).toInstant();
const seconds = (moment: string) => at(moment).epochMilliseconds / 1000;

describe("a month", () => {
	test("has a bucket per day of this month, compared to the same day and time of last month", () => {
		const ranges = periodRanges("month", timeZone, at("2026-11-15T12:00"));
		expect(ranges).toMatchObject({
			from: at("2026-11-01T00:00"),
			previousFrom: at("2026-10-01T00:00"),
			previousTo: at("2026-10-15T12:00"),
			bucket: "day",
			buckets: 30,
		});
	});

	test("compares to the same time of last month across October's 25-hour day", () => {
		const ranges = periodRanges("month", timeZone, at("2026-11-30T23:30"));
		expect(ranges.previousTo).toEqual(at("2026-10-30T23:30"));
	});

	test("February has 28 days, compared with January's first 28", () => {
		const ranges = periodRanges("month", timeZone, at("2027-02-10T09:00"));
		expect(ranges.buckets).toBe(28);
		expect(ranges.previousFrom).toEqual(at("2027-01-01T00:00"));
		expect(ranges.previousTo).toEqual(at("2027-01-10T09:00"));
	});

	test("a day last month hasn't compares with the whole of last month", () => {
		for (const now of ["2027-03-29T08:00", "2027-03-31T18:00"]) {
			const ranges = periodRanges("month", timeZone, at(now));
			expect(ranges.buckets).toBe(31);
			expect(ranges.previousTo).toEqual(at("2027-03-01T00:00"));
		}
		expect(periodRanges("month", timeZone, at("2027-03-15T08:00")).previousTo).toEqual(
			at("2027-02-15T08:00"),
		);
	});
});

test("today compares to the same time yesterday, also the day after a 25-hour one", () => {
	const ranges = periodRanges("day", timeZone, at("2026-10-26T12:00"));
	expect(ranges).toMatchObject({
		from: at("2026-10-26T00:00"),
		previousFrom: at("2026-10-25T00:00"),
		previousTo: at("2026-10-25T12:00"),
		bucket: "hour",
		buckets: 24,
	});
});

/**
 * Laboratorium's readings, one per quarter hour from `from` up to `to` (local), of 1 kWh at a peak
 * of 10 kW, `peakAt`'s at 100.
 */
async function readings(from: string, to: string, peakAt?: string) {
	const { zone } = await riedel();
	await rows(
		`with recursive quarter(start) as (select ? union all select start + 900 from quarter where start + 900 < ?)
		 insert into energy_reading (organization_id, zone_id, start, avg_kw, peak_kw, kwh)
		 select ?, ?, start, 4, case when start = ? then 100 else 10 end, 1 from quarter`,
		[seconds(from), seconds(to), shltrId, zone("Z-LAB").id, peakAt ? seconds(peakAt) : -1],
	);
}

/** Riedel's figures over the `period` at `now` (local), as a planner sees them. */
const figuresAt = (period: "day" | "month", now: string) =>
	as(shltr.member, async () => {
		const site = await loadSite((await riedel()).siteId);
		return siteFigures(site, periodRanges(period, site.timeZone, at(now)), at(now));
	});

const lab = async (period: "day" | "month", now: string) =>
	(await figuresAt(period, now)).zones.find((zone) => zone.code === "Z-LAB")!;

describe("a report", () => {
	test("compares with the week before by the clock, also the 25-hour week summer time ends in", () => {
		const day = (date: string) => Temporal.PlainDate.from(date);
		const ranges = reportRanges(
			day("2026-10-26"),
			day("2026-11-01"),
			timeZone,
			at("2026-11-10T09:00"),
		);
		expect(ranges).toMatchObject({
			from: at("2026-10-26T00:00"),
			previousFrom: at("2026-10-19T00:00"),
			previousTo: at("2026-10-26T00:00"),
		});
		expect(ranges.previousAt(at("2026-10-28T12:00"))).toEqual(at("2026-10-21T12:00"));
	});
});

describe("the previous period's sums", () => {
	test("go no further than today's readings: at 00:10, before the first is in, nothing", async () => {
		await readings("2030-01-14T00:00", "2030-01-15T00:00");
		expect(await lab("day", "2030-01-15T00:10")).toMatchObject({ kwh: 0, previousKwh: 0 });
	});

	test("go as far as a gateway that sends every hour has sent today, peaks too", async () => {
		await readings("2030-02-14T00:00", "2030-02-15T00:00", "2030-02-14T10:00");
		await readings("2030-02-15T00:00", "2030-02-15T10:00");
		expect(await lab("day", "2030-02-15T10:20")).toMatchObject({
			kwh: 40,
			previousKwh: 40,
			peakKw: 10,
			previousPeakKw: 10,
		});
	});

	test("of last month go as far as this month's readings, by the same day and time", async () => {
		await readings("2030-04-01T00:00", "2030-05-01T00:00");
		await readings("2030-05-01T00:00", "2030-05-10T10:00");
		const zone = await lab("month", "2030-05-10T10:20");
		expect(zone.kwh).toBe(9 * 96 + 40);
		expect(zone.previousKwh).toBe(zone.kwh);
	});
});

test("a door open since Friday is open on Monday, losing since the period began", async () => {
	const { door } = await riedel();
	const dock = door("D-VR1");
	const [{ loss_kw: lossKw }] = await rows<{ loss_kw: number }>(
		`select loss_kw from energy_door where id = ?`,
		[dock.id],
	);
	await rows(
		`insert into energy_door_event (organization_id, door_id, at, open) values (?, ?, ?, 0), (?, ?, ?, 1)`,
		[shltrId, dock.id, seconds("2030-06-10T00:00"), shltrId, dock.id, seconds("2030-06-14T18:00")],
	);
	const { doors } = await figuresAt("day", "2030-06-17T10:00");
	const figures = doors.find((found) => found.id === dock.id)!;
	expect(figures).toMatchObject({
		openedAt: at("2030-06-14T18:00"),
		minutesOpen: (2 * 24 + 16) * 60,
		overdue: true,
		openingsToday: 0,
	});
	// Today's and yesterday's to the same time: ten hours each.
	expect(figures.lossKwh).toBeCloseTo(10 * lossKw);
	expect(figures.previousLossKwh).toBeCloseTo(10 * lossKw);
	expect(figures.lossKwhToday).toBeCloseTo(10 * lossKw);
});
