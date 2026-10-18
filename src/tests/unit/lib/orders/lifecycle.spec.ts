import { describe, expect, test } from "vite-plus/test";

import { isEditableOrder, manualOrderStatuses, orderStatuses } from "#lib/models.ts";
import { fieldActions, plannedStatus, statusChoices } from "#lib/orders/lifecycle.ts";

describe("fieldActions", () => {
	test("a scheduled job can be started and noted, not yet worked on", () => {
		expect(fieldActions("scheduled")).toEqual({ start: true, work: false, note: true });
	});

	test("a job in progress can be worked on and noted", () => {
		expect(fieldActions("in_progress")).toEqual({ start: false, work: true, note: true });
	});

	test("nothing can be done with quotes, finished or cancelled orders", () => {
		for (const status of orderStatuses.filter((s) => s !== "scheduled" && s !== "in_progress")) {
			expect(fieldActions(status), status).toEqual({ start: false, work: false, note: false });
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
