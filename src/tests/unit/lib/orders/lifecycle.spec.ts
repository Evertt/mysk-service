import { describe, expect, test } from "vite-plus/test";

import { isEditableOrder, manualOrderStatuses, orderStatuses } from "#lib/models.ts";
import {
	fieldActions,
	mayDeleteOrder,
	mayEditOrder,
	plannedStatus,
	statusChoices,
} from "#lib/orders/lifecycle.ts";

describe("fieldActions", () => {
	test("a scheduled job can be set out for, started and noted, not yet worked on", () => {
		expect(fieldActions("scheduled")).toEqual({
			depart: true,
			start: true,
			work: false,
			note: true,
		});
	});

	test("a job the engineer is on the way to can be started and noted, not set out for again", () => {
		expect(fieldActions("on_the_way")).toEqual({
			depart: false,
			start: true,
			work: false,
			note: true,
		});
	});

	test("a job in progress can be worked on and noted", () => {
		expect(fieldActions("in_progress")).toEqual({
			depart: false,
			start: false,
			work: true,
			note: true,
		});
	});

	test("nothing can be done with quotes, finished or cancelled orders", () => {
		const field = ["scheduled", "on_the_way", "in_progress"];
		for (const status of orderStatuses.filter((s) => !field.includes(s))) {
			expect(fieldActions(status), status).toEqual({
				depart: false,
				start: false,
				work: false,
				note: false,
			});
		}
	});
});

test("an order can be given any status by hand, its own among them, until it's invoiced", () => {
	for (const status of manualOrderStatuses) {
		expect(statusChoices(status), status).toEqual(manualOrderStatuses);
	}
	expect(statusChoices("invoiced")).toEqual([]);
});

test("an order awaiting acceptance gets no status by hand: it's accepted or rejected", () => {
	expect(statusChoices("awaiting_acceptance")).toEqual([]);
	expect(isEditableOrder("awaiting_acceptance")).toBe(true);
});

test("a quote that gets an engineer becomes scheduled; other statuses stay", () => {
	expect(plannedStatus("quote", 3)).toBe("scheduled");
	expect(plannedStatus("quote", null)).toBe("quote");
	expect(plannedStatus("scheduled", null)).toBe("scheduled");
	expect(plannedStatus("in_progress", 3)).toBe("in_progress");
});

test("an order can be edited until it's invoiced, and not while it awaits acceptance", () => {
	expect(orderStatuses.filter(mayEditOrder)).toEqual([
		"quote",
		"scheduled",
		"on_the_way",
		"in_progress",
		"completed",
		"cancelled",
	]);
});

test("an order can be deleted until it's invoiced, also while it awaits acceptance", () => {
	expect(orderStatuses.filter(mayDeleteOrder)).toEqual([
		"awaiting_acceptance",
		"quote",
		"scheduled",
		"on_the_way",
		"in_progress",
		"completed",
		"cancelled",
	]);
});
