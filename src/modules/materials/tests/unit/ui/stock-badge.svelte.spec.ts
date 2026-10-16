import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { type BadgeTone, badgeVariants } from "#lib/components/ui/badge/index.ts";
import type { MaterialUnit } from "#modules/materials/model.ts";
import StockBadge from "#modules/materials/ui/stock-badge.svelte";

test.each<[number, MaterialUnit, string, BadgeTone]>([
	[0, "pcs", "Out of stock", "danger"],
	[-2, "kg", "Out of stock", "danger"],
	[9, "pcs", "Low", "warning"],
	[10, "pcs", "In stock", "success"],
	[49.5, "m", "Low", "warning"],
	[50, "l", "In stock", "success"],
])("%d %s is %s", async (stock, unit, label, tone) => {
	render(StockBadge, { stock, unit });

	const badge = page.getByText(label);
	await expect.element(badge).toHaveAttribute("data-slot", "badge");
	await expect.element(badge).toHaveClass(...badgeVariants({ variant: tone }).split(" "));
});
