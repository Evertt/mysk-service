import { describe, expect, test } from "vite-plus/test";

import {
	contractStatus,
	doneOrderStatuses,
	fitsUnit,
	holdsStock,
	isDoneOrder,
	isEditableOrder,
	isOpenOrder,
	lineTotal,
	manualOrderStatuses,
	openOrderStatuses,
	type OrderStatus,
	orderStatuses,
	quantityStep,
} from "./models.ts";

describe("contractStatus", () => {
	const contract = { startsOn: new Date(2026, 0, 1), endsOn: new Date(2026, 11, 31) };

	test("is upcoming before the first day", () => {
		expect(contractStatus(contract, new Date(2025, 11, 31, 23, 59))).toBe("upcoming");
	});

	test("is active from the first through the last day", () => {
		expect(contractStatus(contract, new Date(2026, 0, 1))).toBe("active");
		expect(contractStatus(contract, new Date(2026, 11, 31, 23, 59))).toBe("active");
	});

	test("has expired after the last day", () => {
		expect(contractStatus(contract, new Date(2027, 0, 1))).toBe("expired");
	});
});

test("every order status is either open, done or cancelled", () => {
	for (const status of orderStatuses) {
		const groups = [isOpenOrder(status), isDoneOrder(status), status === "cancelled"];
		expect(groups.filter(Boolean), status).toHaveLength(1);
	}
	expect(openOrderStatuses.length + doneOrderStatuses.length + 1).toBe(orderStatuses.length);
});

test("an invoiced order can't be changed, nor be made invoiced by hand", () => {
	expect(orderStatuses.filter((status) => !isEditableOrder(status))).toEqual(["invoiced"]);
	const manual: readonly OrderStatus[] = manualOrderStatuses;
	expect(orderStatuses.filter((status) => !manual.includes(status))).toEqual(["invoiced"]);
	// Every status that can be chosen can be changed again.
	expect(manualOrderStatuses.every(isEditableOrder)).toBe(true);
});

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
