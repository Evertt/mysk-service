import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";
import { createRawSnippet } from "svelte";
import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import ToolbarBand from "#lib/components/toolbar-band.svelte";

test("is the page's heading, with its count, its line, its controls and a strip below", async () => {
	const { container } = await render(ToolbarBand, {
		title: "Schedule",
		icon: CalendarDaysIcon,
		count: "8 orders",
		description: "Week 42 · 12–18 Oct",
		actions: createRawSnippet(() => ({ render: () => '<a href="/next">Next</a>' })),
		children: createRawSnippet(() => ({ render: () => "<p>Chips</p>" })),
	});

	await expect.element(page.getByRole("heading", { level: 1, name: "Schedule" })).toBeVisible();
	await expect.element(page.getByText("8 orders")).toBeVisible();
	await expect.element(page.getByText("Week 42 · 12–18 Oct")).toBeVisible();
	await expect.element(page.getByRole("link", { name: "Next" })).toBeVisible();
	// The strip is under the band, outside its colour.
	const band = container.querySelector("header")!;
	const strip = page.getByText("Chips").element();
	expect(band.contains(strip)).toBe(false);
	expect(band.getAttribute("class")).toContain("bg-primary");
});

test("leaves out the pill, the line and the strip without them", async () => {
	const { container } = await render(ToolbarBand, { title: "Equipment" });

	expect(container.querySelector("[data-band-count]")).toBeNull();
	expect(container.querySelector("p")).toBeNull();
	expect(container.querySelector("[data-toolbar-band] > div")).toBeNull();
});
