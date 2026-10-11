import { describe, expect, test } from "vite-plus/test";

import { advanceDueDate, dueBefore, isOverdue, nextDueBucket } from "#modules/maintenance/model.ts";

const day = (year: number, month: number, date: number) => new Date(year, month - 1, date);

describe("advanceDueDate", () => {
	test("moves on by whole months, at the start of the day", () => {
		expect(advanceDueDate(day(2026, 3, 15), 1)).toEqual(day(2026, 4, 15));
		expect(advanceDueDate(day(2026, 3, 15), 12)).toEqual(day(2027, 3, 15));
		expect(advanceDueDate(day(2026, 11, 10), 3)).toEqual(day(2027, 2, 10));
		expect(advanceDueDate(day(2026, 1, 1), 60)).toEqual(day(2031, 1, 1));
	});

	test("takes a short month's last day", () => {
		expect(advanceDueDate(day(2026, 1, 31), 1)).toEqual(day(2026, 2, 28));
		expect(advanceDueDate(day(2028, 1, 31), 1)).toEqual(day(2028, 2, 29));
		expect(advanceDueDate(day(2026, 8, 31), 1)).toEqual(day(2026, 9, 30));
	});

	test("comes back to the plan's own day after a short month", () => {
		const february = advanceDueDate(day(2026, 1, 31), 1, 31);
		expect(february).toEqual(day(2026, 2, 28));
		expect(advanceDueDate(february, 1, 31)).toEqual(day(2026, 3, 31));
		expect(advanceDueDate(day(2026, 4, 30), 1, 31)).toEqual(day(2026, 5, 31));
		// Without the plan's day, the clamped date's own day is all there is to go on.
		expect(advanceDueDate(february, 1)).toEqual(day(2026, 3, 28));
	});
});

describe("due ranges", () => {
	const now = new Date(2026, 9, 11, 14, 30);

	test("are horizons from the start of today", () => {
		expect(dueBefore("overdue", now)).toEqual(day(2026, 10, 11));
		expect(dueBefore("30-days", now)).toEqual(day(2026, 11, 10));
		expect(dueBefore("90-days", now)).toEqual(day(2027, 1, 9));
	});

	test("a plan due today isn't overdue yet; one due yesterday is", () => {
		expect(isOverdue(day(2026, 10, 11), now)).toBe(false);
		expect(isOverdue(day(2026, 10, 10), now)).toBe(true);
	});

	test("the equipment list's buckets: overdue, soon, none, and later ones in neither", () => {
		expect(nextDueBucket(null, now)).toBe("none");
		expect(nextDueBucket(day(2026, 10, 10), now)).toBe("overdue");
		expect(nextDueBucket(day(2026, 10, 11), now)).toBe("soon");
		expect(nextDueBucket(day(2026, 11, 9), now)).toBe("soon");
		expect(nextDueBucket(day(2026, 11, 10), now)).toBe("later");
	});
});
