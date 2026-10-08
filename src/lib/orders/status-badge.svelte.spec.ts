import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { badgeVariants } from "#lib/components/ui/badge/index.js";
import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
import type { OrderStatus } from "#lib/models.js";

import StatusBadge from "./status-badge.svelte";

test.each<[OrderStatus, string, BadgeVariant]>([
	["quote", "Quote", "outline"],
	["scheduled", "Scheduled", "secondary"],
	["in_progress", "In progress", "default"],
	["completed", "Completed", "secondary"],
	["invoiced", "Invoiced", "outline"],
	["cancelled", "Cancelled", "destructive"],
])("%s shows as %s, in the %s style, with its icon", async (status, label, variant) => {
	render(StatusBadge, { status });

	const badge = page.getByText(label);
	await expect.element(badge).toHaveAttribute("data-slot", "badge");
	await expect.element(badge).toHaveClass(...badgeVariants({ variant }).split(" "));
	expect(badge.element().querySelector("svg")).not.toBeNull();
});
