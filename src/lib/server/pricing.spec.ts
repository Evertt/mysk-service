import { expect, test } from "vite-plus/test";

import { laborCost, STANDARD_HOURLY_RATE } from "./pricing.ts";

test("labour is charged at the engineer's hourly rate", () => {
	expect(laborCost(2.5, 6000)).toBe(15_000);
});

test.each([null, undefined])(
	"an unassigned order (rate %s) is estimated at the standard rate",
	(rate) => {
		expect(laborCost(2, rate)).toBe(2 * STANDARD_HOURLY_RATE);
	},
);

test("a rate of zero is a rate, not a missing one", () => {
	expect(laborCost(3, 0)).toBe(0);
});

test("partial hours are rounded to whole cents", () => {
	expect(laborCost(1 / 3, 8500)).toBe(2833);
	expect(laborCost(0.25, 4999)).toBe(1250);
});

test("no hours cost nothing", () => {
	expect(laborCost(0, null)).toBe(0);
});
