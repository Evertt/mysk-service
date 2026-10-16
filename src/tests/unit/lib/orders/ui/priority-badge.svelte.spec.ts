import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { badgeVariants } from "#lib/components/ui/badge/index.ts";
import type { BadgeTone } from "#lib/components/ui/badge/index.ts";
import type { OrderPriority } from "#lib/models.ts";
import PriorityBadge from "#lib/orders/ui/priority-badge.svelte";

test.each<[OrderPriority, string, BadgeTone]>([
	["low", "Low", "neutral"],
	["normal", "Normal", "info"],
	["high", "High", "warning"],
	["urgent", "Urgent", "danger"],
])("%s shows as %s, in the %s tone, with its icon", async (priority, label, tone) => {
	render(PriorityBadge, { priority });

	const badge = page.getByText(label);
	await expect.element(badge).toHaveAttribute("data-slot", "badge");
	await expect.element(badge).toHaveClass(...badgeVariants({ variant: tone }).split(" "));
	expect(badge.element().querySelector("svg")).not.toBeNull();
});
