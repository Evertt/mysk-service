import BuildingIcon from "@lucide/svelte/icons/building";
import Building2Icon from "@lucide/svelte/icons/building-2";
import StoreIcon from "@lucide/svelte/icons/store";

import { type BadgeDisplay, labelOptions, withLabels } from "#lib/i18n/index.ts";
import { type CustomerSegment, customerSegments } from "#lib/models.ts";

/** A segment means nothing good or bad: plain variants, the largest the boldest. */
const segmentDetails: Record<CustomerSegment, BadgeDisplay> = {
	enterprise: { icon: Building2Icon, tone: "default" },
	mid_market: { icon: BuildingIcon, tone: "secondary" },
	small_business: { icon: StoreIcon, tone: "outline" },
};

/** Each segment's translated `label`, icon and badge tone. */
export const customerSegmentDisplay = withLabels("customerSegment", segmentDetails);

/** Options for faceted filters and selects, largest segment first. */
export const segmentOptions = labelOptions("customerSegment", customerSegments, segmentDetails);
