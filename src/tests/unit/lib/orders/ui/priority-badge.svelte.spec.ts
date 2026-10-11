import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { badgeVariants } from "#lib/components/ui/badge/index.ts";
import type { BadgeVariant } from "#lib/components/ui/badge/index.ts";
import type { OrderPriority } from "#lib/models.ts";

import PriorityBadge from "./priority-badge.svelte";

test.each<[OrderPriority, string, BadgeVariant]>([
	["low", "Low", "ghost"],
	["normal", "Normal", "outline"],
	["high", "High", "secondary"],
	["urgent", "Urgent", "destructive"],
])("%s shows as %s, in the %s style, with its icon", async (priority, label, variant) => {
	render(PriorityBadge, { priority });

	const badge = page.getByText(label);
	await expect.element(badge).toHaveAttribute("data-slot", "badge");
	await expect.element(badge).toHaveClass(...badgeVariants({ variant }).split(" "));
	expect(badge.element().querySelector("svg")).not.toBeNull();
});
