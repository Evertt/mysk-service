import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { badgeVariants } from "#lib/components/ui/badge/index.ts";
import type { BadgeVariant } from "#lib/components/ui/badge/index.ts";
import type { SlaState } from "#modules/contracts/coverage.ts";
import SlaBadge from "#modules/contracts/ui/sla-badge.svelte";

test.each<[SlaState, string, BadgeVariant]>([
	["on_track", "On track", "outline"],
	["at_risk", "At risk", "secondary"],
	["overdue", "Overdue", "destructive"],
	["responded", "Responded", "ghost"],
])("%s shows as %s, in the %s style, with its icon", async (state, label, variant) => {
	render(SlaBadge, { state });

	const badge = page.getByText(label);
	await expect.element(badge).toHaveAttribute("data-slot", "badge");
	await expect.element(badge).toHaveClass(...badgeVariants({ variant }).split(" "));
	expect(badge.element().querySelector("svg")).not.toBeNull();
});
