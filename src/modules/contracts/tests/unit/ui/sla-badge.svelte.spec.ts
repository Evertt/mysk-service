import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { badgeVariants } from "#lib/components/ui/badge/index.ts";
import type { BadgeTone } from "#lib/components/ui/badge/index.ts";
import type { SlaState } from "#modules/contracts/coverage.ts";
import SlaBadge from "#modules/contracts/ui/sla-badge.svelte";

test.each<[SlaState, string, BadgeTone]>([
	["on_track", "On track", "info"],
	["at_risk", "At risk", "warning"],
	["overdue", "Overdue", "danger"],
	["responded", "Responded", "success"],
])("%s shows as %s, in the %s tone, with its icon", async (state, label, tone) => {
	render(SlaBadge, { state });

	const badge = page.getByText(label);
	await expect.element(badge).toHaveAttribute("data-slot", "badge");
	await expect.element(badge).toHaveClass(...badgeVariants({ variant: tone }).split(" "));
	expect(badge.element().querySelector("svg")).not.toBeNull();
});
