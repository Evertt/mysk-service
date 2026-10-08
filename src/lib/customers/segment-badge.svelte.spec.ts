import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { badgeVariants } from "#lib/components/ui/badge/index.ts";
import type { BadgeVariant } from "#lib/components/ui/badge/index.ts";
import type { CustomerSegment } from "#lib/models.ts";

import SegmentBadge from "./segment-badge.svelte";

test.each<[CustomerSegment, string, BadgeVariant]>([
	["enterprise", "Enterprise", "default"],
	["mid_market", "Mid-market", "secondary"],
	["small_business", "Small business", "outline"],
])("%s shows as %s, in the %s style, with its icon", async (segment, label, variant) => {
	render(SegmentBadge, { segment });

	const badge = page.getByText(label);
	await expect.element(badge).toHaveAttribute("data-slot", "badge");
	await expect.element(badge).toHaveClass(...badgeVariants({ variant }).split(" "));
	expect(badge.element().querySelector("svg")).not.toBeNull();
});
