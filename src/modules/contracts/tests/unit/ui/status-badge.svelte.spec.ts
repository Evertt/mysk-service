import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { badgeVariants } from "#lib/components/ui/badge/index.ts";
import type { BadgeVariant } from "#lib/components/ui/badge/index.ts";
import type { ContractStatus } from "#modules/contracts/model.ts";
import StatusBadge from "#modules/contracts/ui/status-badge.svelte";

test.each<[ContractStatus, string, BadgeVariant]>([
	["upcoming", "Upcoming", "outline"],
	["active", "Active", "default"],
	["expired", "Expired", "ghost"],
])("%s shows as %s, in the %s style, with its icon", async (status, label, variant) => {
	render(StatusBadge, { status });

	const badge = page.getByText(label);
	await expect.element(badge).toHaveAttribute("data-slot", "badge");
	await expect.element(badge).toHaveClass(...badgeVariants({ variant }).split(" "));
	expect(badge.element().querySelector("svg")).not.toBeNull();
});
