import { customerSegments } from "#lib/models.ts";

import { describeOptions } from "../display.test-support.ts";
import { segmentOptions } from "./display.ts";

describeOptions("customer segments", segmentOptions, customerSegments);
