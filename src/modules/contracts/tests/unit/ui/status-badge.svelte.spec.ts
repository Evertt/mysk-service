import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { badgeVariants } from "#lib/components/ui/badge/index.ts";
import type { BadgeTone } from "#lib/components/ui/badge/index.ts";
import type { ContractStatus } from "#modules/contracts/model.ts";
import StatusBadge from "#modules/contracts/ui/status-badge.svelte";

test.each<[ContractStatus, string, BadgeTone]>([
	["upcoming", "Upcoming", "info"],
	["active", "Active", "success"],
	["expired", "Expired", "neutral"],
])("%s shows as %s, in the %s tone, with its icon", async (status, label, tone) => {
	render(StatusBadge, { status });

	const badge = page.getByText(label);
	await expect.element(badge).toHaveAttribute("data-slot", "badge");
	await expect.element(badge).toHaveClass(...badgeVariants({ variant: tone }).split(" "));
	expect(badge.element().querySelector("svg")).not.toBeNull();
});
