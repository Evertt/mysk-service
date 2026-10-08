import { expect, test } from "vite-plus/test";

import { addDays, atTime, DAY, nextDay, startOfDay, timeOfDay, toDateInput } from "./dates.ts";

test("a day is 24 hours in milliseconds", () => {
	expect(DAY).toBe(86_400_000);
});

test("addDays goes by calendar days, keeping the time of day", () => {
	expect(addDays(new Date(2026, 9, 7, 14, 30), 3)).toEqual(new Date(2026, 9, 10, 14, 30));
	expect(addDays(new Date(2026, 9, 30, 8), 3)).toEqual(new Date(2026, 10, 2, 8));
	expect(addDays(new Date(2026, 0, 1, 8), -1)).toEqual(new Date(2025, 11, 31, 8));
	expect(addDays(new Date(2026, 9, 7), 0)).toEqual(new Date(2026, 9, 7));
});

test("addDays leaves its argument alone", () => {
	const date = new Date(2026, 9, 7);
	addDays(date, 5);

	expect(date).toEqual(new Date(2026, 9, 7));
});

test("addDays keeps the time of day when the clocks change", () => {
	// 2026-03-29 and 2026-10-25 are when Europe changes its clocks; elsewhere these days are plain
	// ones, and the time of day is kept all the same.
	const before = addDays(new Date(2026, 2, 28, 9), 1);
	expect([before.getDate(), before.getHours()]).toEqual([29, 9]);
	const after = addDays(new Date(2026, 9, 24, 9), 2);
	expect([after.getDate(), after.getHours()]).toEqual([26, 9]);
});

test("startOfDay is midnight of the same day", () => {
	expect(startOfDay(new Date(2026, 9, 7, 23, 59, 59, 999))).toEqual(new Date(2026, 9, 7));
	expect(startOfDay(new Date(2026, 9, 7))).toEqual(new Date(2026, 9, 7));
});

test("nextDay is midnight of the following day, also across a month or year", () => {
	expect(nextDay(new Date(2026, 9, 7, 15))).toEqual(new Date(2026, 9, 8));
	expect(nextDay(new Date(2026, 9, 31, 23, 59))).toEqual(new Date(2026, 10, 1));
	expect(nextDay(new Date(2026, 11, 31))).toEqual(new Date(2027, 0, 1));
});

test("toDateInput is the local day as yyyy-mm-dd, or empty", () => {
	expect(toDateInput(new Date(2026, 9, 7, 23, 59))).toBe("2026-10-07");
	expect(toDateInput(new Date(2026, 0, 1))).toBe("2026-01-01");
	expect(toDateInput(null)).toBe("");
	expect(toDateInput(undefined)).toBe("");
});

test("times of day are shown like the time input does, and set a day's time", () => {
	expect(timeOfDay(new Date(2026, 9, 7, 8, 5))).toBe("08:05");
	expect(atTime(new Date(2026, 9, 7), "14:30")).toEqual(new Date(2026, 9, 7, 14, 30));
	expect(atTime(new Date(2026, 9, 7, 23, 59, 59), "09:00")).toEqual(new Date(2026, 9, 7, 9));
});

test("atTime leaves its argument alone", () => {
	const day = new Date(2026, 9, 7, 23, 59, 59);
	atTime(day, "09:00");

	expect(day).toEqual(new Date(2026, 9, 7, 23, 59, 59));
});
