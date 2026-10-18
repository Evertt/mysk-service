/**
 * The periods a site's figures compare: this month's days against last month's, day N against day
 * N, its sums to the same day and time of last month (by the clock on the wall, across a change to
 * or from summer time), and today against yesterday to the same time.
 */
import { describe, expect, test } from "vite-plus/test";

import { periodRanges } from "#modules/energy/server/figures.ts";

const timeZone = "Europe/Amsterdam";
const at = (moment: string) =>
	Temporal.PlainDateTime.from(moment).toZonedDateTime(timeZone).toInstant();

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
