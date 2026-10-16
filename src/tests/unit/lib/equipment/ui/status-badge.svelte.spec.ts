import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { type BadgeTone, badgeVariants } from "#lib/components/ui/badge/index.ts";
import StatusBadge from "#lib/equipment/ui/status-badge.svelte";
import type { EquipmentStatus } from "#lib/models.ts";

test.each<[EquipmentStatus, string, BadgeTone]>([
	["operational", "Operational", "success"],
	["needs_service", "Needs service", "warning"],
	["out_of_service", "Out of service", "danger"],
	["decommissioned", "Decommissioned", "neutral"],
])("%s shows as %s, in the %s tone", async (status, label, tone) => {
	render(StatusBadge, { status });

	const badge = page.getByText(label);
	await expect.element(badge).toHaveAttribute("data-slot", "badge");
	await expect.element(badge).toHaveClass(...badgeVariants({ variant: tone }).split(" "));
});
