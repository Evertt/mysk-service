import { customerSegmentDisplay, segmentOptions } from "#lib/customers/display.ts";
import { customerSegments } from "#lib/models.ts";

import { describeBadges, describeOptions } from "../display.test-support.ts";

describeOptions("customer segments", segmentOptions, customerSegments);

describeBadges("segment badges", customerSegmentDisplay, [
	["enterprise", "Enterprise", "default"],
	["mid_market", "Mid-market", "secondary"],
	["small_business", "Small business", "outline"],
]);
