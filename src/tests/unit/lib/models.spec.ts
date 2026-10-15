import { expect, test } from "vite-plus/test";

import {
	doneOrderStatuses,
	isDoneOrder,
	isEditableOrder,
	isOpenOrder,
	manualOrderStatuses,
	openOrderStatuses,
	type OrderStatus,
	orderStatusChoices,
	orderStatuses,
} from "#lib/models.ts";

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

test("an order can be given any status by hand, its own among them, until it's invoiced", () => {
	for (const status of manualOrderStatuses) {
		expect(orderStatusChoices(status), status).toEqual(manualOrderStatuses);
	}
	expect(orderStatusChoices("invoiced")).toEqual([]);
});
