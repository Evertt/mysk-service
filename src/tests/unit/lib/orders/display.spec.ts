import { orderPriorities, orderStatuses, orderTypes } from "#lib/models.ts";
import { priorityOptions, statusOptions, typeOptions } from "#lib/orders/display.ts";

import { describeOptions } from "../display.test-support.ts";

describeOptions("order statuses", statusOptions, orderStatuses);
describeOptions("order priorities", priorityOptions, orderPriorities);
describeOptions("order types", typeOptions, orderTypes);
