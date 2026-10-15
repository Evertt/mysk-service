import { describe, expect, test } from "vite-plus/test";

import {
	advanceDueDate,
	automaticHorizon,
	dueBefore,
	dueForAutomaticOrder,
	isOverdue,
	nextDueBucket,
} from "#modules/maintenance/model.ts";

const day = (year: number, month: number, date: number) =>
	Temporal.PlainDate.from({ year, month, day: date });

describe("advanceDueDate", () => {
	test("moves on by whole months", () => {
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
	const now = day(2026, 10, 11);

	test("are horizons from today", () => {
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

describe("dueForAutomaticOrder", () => {
	const today = day(2026, 10, 11);
	const horizon = automaticHorizon(today, 30);
	const plan = (due: Temporal.PlainDate, paused = false) => ({ nextDueOn: due, paused });

	test("the horizon is the lead time from today", () => {
		expect(horizon).toEqual(day(2026, 11, 10));
		expect(automaticHorizon(today, 0)).toEqual(today);
	});

	test("takes active plans due before the horizon, overdue ones included", () => {
		expect(dueForAutomaticOrder(plan(day(2026, 1, 1)), null, horizon)).toBe(true);
		expect(dueForAutomaticOrder(plan(day(2026, 11, 9)), null, horizon)).toBe(true);
		expect(dueForAutomaticOrder(plan(day(2026, 11, 10)), null, horizon)).toBe(false);
		expect(dueForAutomaticOrder(plan(day(2026, 10, 1), true), null, horizon)).toBe(false);
	});

	test("never makes a second order while the last one is open", () => {
		const due = plan(day(2026, 10, 1));
		for (const status of ["quote", "scheduled", "in_progress"] as const) {
			expect(dueForAutomaticOrder(due, status, horizon)).toBe(false);
		}
		for (const status of ["completed", "invoiced", "cancelled"] as const) {
			expect(dueForAutomaticOrder(due, status, horizon)).toBe(true);
		}
	});
});
