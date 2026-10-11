import { expect, test } from "vite-plus/test";

import { orderPriorities, orderStatuses, orderTypes } from "#lib/models.ts";

import { describeOptions } from "../display.test-support.ts";
import { plannedStatus, priorityOptions, statusOptions, typeOptions } from "./display.ts";

describeOptions("order statuses", statusOptions, orderStatuses);
describeOptions("order priorities", priorityOptions, orderPriorities);
describeOptions("order types", typeOptions, orderTypes);

test("a quote that gets an engineer becomes scheduled; other statuses stay", () => {
	expect(plannedStatus("quote", 3)).toBe("scheduled");
	expect(plannedStatus("quote", null)).toBe("quote");
	expect(plannedStatus("scheduled", null)).toBe("scheduled");
	expect(plannedStatus("in_progress", 3)).toBe("in_progress");
});
