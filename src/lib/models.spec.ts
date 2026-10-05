import { describe, expect, test } from "vite-plus/test";

import {
	contractStatus,
	doneOrderStatuses,
	isDoneOrder,
	isOpenOrder,
	openOrderStatuses,
	orderStatuses,
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
