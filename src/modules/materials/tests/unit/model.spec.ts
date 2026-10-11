import { describe, expect, test } from "vite-plus/test";

import { orderStatuses } from "#lib/models.ts";
import { fitsUnit, holdsStock, lineTotal, quantityStep } from "#modules/materials/model.ts";

test("orders hold stock from scheduled on, but not as a quote or once cancelled", () => {
	expect(orderStatuses.filter((status) => !holdsStock(status))).toEqual(["quote", "cancelled"]);
	expect(holdsStock("scheduled")).toBe(true);
	expect(holdsStock("invoiced")).toBe(true);
});

describe("quantities", () => {
	test("pieces are counted whole", () => {
		expect(quantityStep("pcs")).toBe(1);
		expect(fitsUnit(3, "pcs")).toBe(true);
		expect(fitsUnit(2.5, "pcs")).toBe(false);
	});

	test.each(["m", "kg", "l"] as const)("%s is counted to two decimals", (unit) => {
		expect(quantityStep(unit)).toBe(0.01);
		expect(fitsUnit(2.5, unit)).toBe(true);
		// Not exactly representable, but two decimals all the same.
		expect(fitsUnit(2.55, unit)).toBe(true);
		expect(fitsUnit(0.07, unit)).toBe(true);
		expect(fitsUnit(2.125, unit)).toBe(false);
	});

	test("a line's amount is rounded to the cent", () => {
		expect(lineTotal(3, 1250)).toBe(3750);
		expect(lineTotal(2.5, 1999)).toBe(4998);
		expect(lineTotal(0.33, 100)).toBe(33);
	});
});
