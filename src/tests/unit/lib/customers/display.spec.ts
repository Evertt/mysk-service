import { segmentOptions } from "#lib/customers/display.ts";
import { customerSegments } from "#lib/models.ts";

import { describeOptions } from "../display.test-support.ts";

describeOptions("customer segments", segmentOptions, customerSegments);
