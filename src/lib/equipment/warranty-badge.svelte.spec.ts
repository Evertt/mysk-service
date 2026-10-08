import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { badgeVariants } from "#lib/components/ui/badge/index.js";

import WarrantyBadge from "./warranty-badge.svelte";

const until = new Date(2026, 5, 30);

test("work up to and including the warranty's last day is covered", async () => {
	render(WarrantyBadge, { until, at: new Date(2026, 5, 30, 17) });

	await expect
		.element(page.getByText("Covered"))
		.toHaveClass(...badgeVariants({ variant: "secondary" }).split(" "));
});

test("work after the warranty's last day is not covered", async () => {
	render(WarrantyBadge, { until, at: new Date(2026, 6, 1) });

	await expect
		.element(page.getByText("Expired"))
		.toHaveClass(...badgeVariants({ variant: "outline" }).split(" "));
});

test("without a date it's about today", async () => {
	const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
	const { rerender } = await render(WarrantyBadge, { until: tomorrow });
	await expect.element(page.getByText("Covered")).toBeInTheDocument();

	await rerender({ until: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });
	await expect.element(page.getByText("Expired")).toBeInTheDocument();
});
