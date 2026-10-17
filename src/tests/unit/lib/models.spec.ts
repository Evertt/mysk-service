import { expect, test } from "vite-plus/test";

import {
	doneOrderStatuses,
	isAwaitingAcceptance,
	isDoneOrder,
	isEditableOrder,
	isOpenOrder,
	manualOrderStatuses,
	openOrderStatuses,
	type OrderStatus,
	orderStatusChoices,
	orderStatuses,
	pendingOrderStatuses,
	reportUrgencies,
} from "#lib/models.ts";

test("every order status is awaiting acceptance, open, done or cancelled", () => {
	for (const status of orderStatuses) {
		const groups = [
			isAwaitingAcceptance(status),
			isOpenOrder(status),
			isDoneOrder(status),
			status === "cancelled",
		];
		expect(groups.filter(Boolean), status).toHaveLength(1);
	}
	expect(openOrderStatuses.length + doneOrderStatuses.length + 2).toBe(orderStatuses.length);
});

test("an order awaiting acceptance comes first, and isn't open work until it's accepted", () => {
	expect(orderStatuses[0]).toBe("awaiting_acceptance");
	expect(isOpenOrder("awaiting_acceptance")).toBe(false);
	// What the customer sees as still to be done: the open orders and their reports.
	expect(pendingOrderStatuses).toEqual(["awaiting_acceptance", ...openOrderStatuses]);
	expect(reportUrgencies).toEqual(["normal", "high", "urgent"]);
});

test("an invoiced order can't be changed, nor be made invoiced or awaiting acceptance by hand", () => {
	expect(orderStatuses.filter((status) => !isEditableOrder(status))).toEqual(["invoiced"]);
	const manual: readonly OrderStatus[] = manualOrderStatuses;
	expect(orderStatuses.filter((status) => !manual.includes(status))).toEqual([
		"awaiting_acceptance",
		"invoiced",
	]);
	// Every status that can be chosen can be changed again.
	expect(manualOrderStatuses.every(isEditableOrder)).toBe(true);
});

test("an order can be given any status by hand, its own among them, until it's invoiced", () => {
	for (const status of manualOrderStatuses) {
		expect(orderStatusChoices(status), status).toEqual(manualOrderStatuses);
	}
	expect(orderStatusChoices("invoiced")).toEqual([]);
});

test("an order awaiting acceptance gets no status by hand: it's accepted or rejected", () => {
	expect(orderStatusChoices("awaiting_acceptance")).toEqual([]);
	expect(isEditableOrder("awaiting_acceptance")).toBe(true);
});
