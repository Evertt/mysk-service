import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { type BadgeVariant, badgeVariants } from "#lib/components/ui/badge/index.js";
import type { EquipmentStatus } from "#lib/models.js";

import StatusBadge from "./status-badge.svelte";

test.each<[EquipmentStatus, string, BadgeVariant]>([
	["operational", "Operational", "secondary"],
	["needs_service", "Needs service", "outline"],
	["out_of_service", "Out of service", "destructive"],
	["decommissioned", "Decommissioned", "ghost"],
])("%s shows as %s, in the %s style", async (status, label, variant) => {
	render(StatusBadge, { status });

	const badge = page.getByText(label);
	await expect.element(badge).toHaveAttribute("data-slot", "badge");
	await expect.element(badge).toHaveClass(...badgeVariants({ variant }).split(" "));
});
