import { orderPriorities, orderStatuses, orderTypes } from "#lib/models.ts";
import {
	orderPriorityDisplay,
	orderStatusDisplay,
	priorityOptions,
	statusOptions,
	typeOptions,
} from "#lib/orders/display.ts";

import { describeBadges, describeOptions } from "../display.test-support.ts";

describeOptions("order statuses", statusOptions, orderStatuses);
describeOptions("order priorities", priorityOptions, orderPriorities);
describeOptions("order types", typeOptions, orderTypes);

describeBadges("order status badges", orderStatusDisplay, [
	["awaiting_acceptance", "Awaiting acceptance", "warning"],
	["quote", "Quote", "info"],
	["scheduled", "Scheduled", "info"],
	["in_progress", "In progress", "warning"],
	["completed", "Completed", "success"],
	["invoiced", "Invoiced", "neutral"],
	["cancelled", "Cancelled", "danger"],
]);

describeBadges("order priority badges", orderPriorityDisplay, [
	["low", "Low", "neutral"],
	["normal", "Normal", "info"],
	["high", "High", "warning"],
	["urgent", "Urgent", "danger"],
]);
