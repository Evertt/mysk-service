import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { type BadgeVariant, badgeVariants } from "#lib/components/ui/badge/index.js";
import type { MaterialUnit } from "#lib/models.js";

import StockBadge from "./stock-badge.svelte";

test.each<[number, MaterialUnit, string, BadgeVariant]>([
	[0, "pcs", "Out of stock", "destructive"],
	[-2, "kg", "Out of stock", "destructive"],
	[9, "pcs", "Low", "outline"],
	[10, "pcs", "In stock", "secondary"],
	[49.5, "m", "Low", "outline"],
	[50, "l", "In stock", "secondary"],
])("%d %s is %s", async (stock, unit, label, variant) => {
	render(StockBadge, { stock, unit });

	const badge = page.getByText(label);
	await expect.element(badge).toHaveAttribute("data-slot", "badge");
	await expect.element(badge).toHaveClass(...badgeVariants({ variant }).split(" "));
});
