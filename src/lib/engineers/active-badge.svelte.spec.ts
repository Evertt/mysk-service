import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { badgeVariants } from "#lib/components/ui/badge/index.js";

import ActiveBadge from "./active-badge.svelte";

test("an active engineer is marked active", async () => {
	render(ActiveBadge, { active: true });

	await expect
		.element(page.getByText("Active"))
		.toHaveClass(...badgeVariants({ variant: "secondary" }).split(" "));
});

test("an inactive engineer is marked inactive, more quietly", async () => {
	render(ActiveBadge, { active: false });

	await expect
		.element(page.getByText("Inactive"))
		.toHaveClass(...badgeVariants({ variant: "ghost" }).split(" "));
});
