import BuildingIcon from "@lucide/svelte/icons/building";
import Building2Icon from "@lucide/svelte/icons/building-2";
import StoreIcon from "@lucide/svelte/icons/store";
import type { Component } from "svelte";

import type { BadgeVariant } from "#lib/components/ui/badge/index.ts";
import { labelOptions, withLabels } from "#lib/i18n/index.ts";
import { type CustomerSegment, customerSegments } from "#lib/models.ts";

interface Display {
	icon: Component;
	variant: BadgeVariant;
}

const segmentDetails: Record<CustomerSegment, Display> = {
	enterprise: { icon: Building2Icon, variant: "default" },
	mid_market: { icon: BuildingIcon, variant: "secondary" },
	small_business: { icon: StoreIcon, variant: "outline" },
};

/** Each segment's translated `label`, icon and badge variant. */
export const segments = withLabels("customerSegment", segmentDetails);

/** Options for faceted filters and selects, largest segment first. */
export const segmentOptions = labelOptions("customerSegment", customerSegments, segmentDetails);
