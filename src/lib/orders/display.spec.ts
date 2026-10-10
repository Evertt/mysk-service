import { orderPriorities, orderStatuses, orderTypes } from "#lib/models.ts";

import { describeOptions } from "../display.test-support.ts";
import { priorityOptions, statusOptions, typeOptions } from "./display.ts";

describeOptions("order statuses", statusOptions, orderStatuses);
describeOptions("order priorities", priorityOptions, orderPriorities);
describeOptions("order types", typeOptions, orderTypes);
