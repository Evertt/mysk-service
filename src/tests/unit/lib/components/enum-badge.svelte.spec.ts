import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import EnumBadge from "#lib/components/enum-badge.svelte";
import { badgeVariants } from "#lib/components/ui/badge/index.ts";
import { labelled } from "#lib/i18n/labels.ts";

const display = labelled({
	done: { label: () => "Done", icon: CircleCheckIcon, tone: "success" },
	open: { label: () => "Open", tone: "outline" },
});

test("shows the value's label in its tone, with its icon", async () => {
	render(EnumBadge, { display, value: "done" });

	const badge = page.getByText("Done");
	await expect.element(badge).toHaveAttribute("data-slot", "badge");
	await expect.element(badge).toHaveClass(...badgeVariants({ variant: "success" }).split(" "));
	expect(badge.element().querySelector("svg[data-icon=inline-start]")).not.toBeNull();
});

test("shows a value without an icon as its label alone, and passes attributes on", async () => {
	render(EnumBadge, { display, value: "open", "data-state": "open", class: "tabular-nums" });

	const badge = page.getByText("Open");
	await expect.element(badge).toHaveAttribute("data-state", "open");
	await expect
		.element(badge)
		.toHaveClass("tabular-nums", ...badgeVariants({ variant: "outline" }).split(" "));
	expect(badge.element().querySelector("svg")).toBeNull();
});
