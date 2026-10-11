import { describe, expect, test } from "vite-plus/test";

import { orderStatuses } from "#lib/models.ts";
import { fieldActions } from "#lib/orders/field.ts";

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
