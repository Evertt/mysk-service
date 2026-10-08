import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { badgeVariants } from "#lib/components/ui/badge/index.ts";
import type { BadgeVariant } from "#lib/components/ui/badge/index.ts";

import LevelBadge from "./level-badge.svelte";
import type { ContractLevel } from "./model.ts";

test.each<[ContractLevel, string, BadgeVariant]>([
	["basic", "Basic", "outline"],
	["standard", "Standard", "outline"],
	["premium", "Premium", "secondary"],
])("%s shows as %s, in the %s style, with its icon", async (level, label, variant) => {
	render(LevelBadge, { level });

	const badge = page.getByText(label);
	await expect.element(badge).toHaveAttribute("data-slot", "badge");
	await expect.element(badge).toHaveClass(...badgeVariants({ variant }).split(" "));
	expect(badge.element().querySelector("svg")).not.toBeNull();
});
