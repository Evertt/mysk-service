import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { badgeVariants } from "#lib/components/ui/badge/index.ts";
import WarrantyBadge from "#lib/equipment/ui/warranty-badge.svelte";
import { at, day } from "#unit/temporal-support.ts";

const until = day("2026-06-30");

test("work up to and including the warranty's last day is covered", async () => {
	render(WarrantyBadge, { until, at: at("2026-06-30 17:00") });

	await expect
		.element(page.getByText("Covered"))
		.toHaveClass(...badgeVariants({ variant: "secondary" }).split(" "));
});

test("work after the warranty's last day is not covered", async () => {
	render(WarrantyBadge, { until, at: day("2026-07-01") });

	await expect
		.element(page.getByText("Expired"))
		.toHaveClass(...badgeVariants({ variant: "outline" }).split(" "));
});

test("without a date it's about today", async () => {
	const today = Temporal.Now.plainDateISO();
	const { rerender } = await render(WarrantyBadge, { until: today.add({ days: 1 }) });
	await expect.element(page.getByText("Covered")).toBeInTheDocument();

	await rerender({ until: today.subtract({ days: 2 }) });
	await expect.element(page.getByText("Expired")).toBeInTheDocument();
});
