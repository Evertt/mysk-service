import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import SegmentedNav from "#lib/components/segmented-nav.svelte";

const items = [
	{ label: "Month", href: "/schedule?view=month", current: false },
	{ label: "Week", href: "/schedule", current: true },
	{ label: "Day", href: "/schedule?view=day", current: false },
];

test("links each segment, the current one marked", async () => {
	render(SegmentedNav, { label: "View", items });

	const nav = page.getByRole("navigation", { name: "View" });
	await expect
		.element(nav.getByRole("link", { name: "Week" }))
		.toHaveAttribute("aria-current", "page");
	await expect
		.element(nav.getByRole("link", { name: "Month" }))
		.toHaveAttribute("href", "/schedule?view=month");
	await expect.element(nav.getByRole("link", { name: "Day" })).not.toHaveAttribute("aria-current");
	await expect.element(nav.getByRole("link", { name: "Week" })).toHaveClass("bg-primary");
});

test("on a band, the current segment is solid in the band's text colour", async () => {
	render(SegmentedNav, { label: "View", items, variant: "band" });

	await expect
		.element(page.getByRole("link", { name: "Week" }))
		.toHaveClass("bg-primary-foreground", "text-primary");
});
