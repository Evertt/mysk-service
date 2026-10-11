import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { type BadgeVariant, badgeVariants } from "#lib/components/ui/badge/index.ts";
import StockBadge from "#lib/materials/ui/stock-badge.svelte";
import type { MaterialUnit } from "#lib/models.ts";

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
