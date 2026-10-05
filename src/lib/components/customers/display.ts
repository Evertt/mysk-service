import BuildingIcon from "@lucide/svelte/icons/building";
import Building2Icon from "@lucide/svelte/icons/building-2";
import StoreIcon from "@lucide/svelte/icons/store";
import type { Component } from "svelte";

import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
import { type CustomerSegment, customerSegments } from "#lib/models.js";

interface Display {
	label: string;
	icon: Component;
	variant: BadgeVariant;
}

export const segments: Record<CustomerSegment, Display> = {
	enterprise: { label: "Enterprise", icon: Building2Icon, variant: "default" },
	mid_market: { label: "Mid-market", icon: BuildingIcon, variant: "secondary" },
	small_business: { label: "Small business", icon: StoreIcon, variant: "outline" },
};

/** Options for faceted filters and selects, largest segment first. */
export const segmentOptions = customerSegments.map((value) => ({ value, ...segments[value] }));
