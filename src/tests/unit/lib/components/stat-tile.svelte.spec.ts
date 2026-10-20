import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
import { createRawSnippet } from "svelte";
import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import StatTile from "#lib/components/stat-tile.svelte";

test("inline: the label with its icon above the value, both in the tone's colour", async () => {
	const { container } = await render(StatTile, {
		label: "Critical",
		value: "4",
		icon: ClipboardListIcon,
		tone: "danger",
	});

	const label = page.getByText("Critical").element();
	const value = page.getByText("4").element();
	expect(label.compareDocumentPosition(value)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	await expect.element(page.getByText("4")).toHaveClass("text-destructive");
	expect(container.querySelector("svg")?.getAttribute("class")).toContain("text-destructive");
});

test("stacked: the icon on top, the value, its label, the detail and the trend", async () => {
	const { container } = await render(StatTile, {
		label: "Revenue, last 30 days",
		value: "€12,000.00",
		icon: ClipboardListIcon,
		tone: "success",
		layout: "stacked",
		detail: "From 56 completed orders",
		trend: { text: "+18% vs the 30 days before", direction: "up", tone: "success" },
	});

	const tile = container.querySelector("[data-stat-tile]")!;
	const order = ["€12,000.00", "Revenue, last 30 days", "From 56 completed orders"].map((text) =>
		page.getByText(text).element(),
	);
	expect(order[0].compareDocumentPosition(order[1])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	expect(order[1].compareDocumentPosition(order[2])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	// The icon is first, in the tone's colour; the value isn't.
	expect(tile.querySelector("svg")?.getAttribute("class")).toContain("text-success");
	await expect.element(page.getByText("€12,000.00")).not.toHaveClass("text-success");
	const trend = tile.querySelector("[data-stat-trend]")!;
	expect(trend.getAttribute("data-stat-trend")).toBe("up");
	expect(trend.textContent?.trim()).toBe("+18% vs the 30 days before");
	expect(trend.getAttribute("class")).toContain("text-success");
});

test("stacked: an action at the top right, and no trend line without a trend", async () => {
	const { container } = await render(StatTile, {
		label: "Low stock",
		value: "4",
		layout: "stacked",
		action: createRawSnippet(() => ({ render: () => '<a href="/materials">View</a>' })),
	});

	await expect
		.element(page.getByRole("link", { name: "View" }))
		.toHaveAttribute("href", "/materials");
	expect(container.querySelector("[data-stat-trend]")).toBeNull();
});

test("row: the label on the left, the value on the right in the tone's colour", async () => {
	render(StatTile, {
		label: "Open orders",
		value: "12",
		icon: ClipboardListIcon,
		tone: "brand",
		layout: "row",
		detail: "56 in all",
	});

	const label = page.getByText("Open orders").element().getBoundingClientRect();
	const value = page.getByText("12", { exact: true }).element().getBoundingClientRect();
	expect(value.left).toBeGreaterThan(label.right);
	await expect.element(page.getByText("12", { exact: true })).toHaveClass("text-primary");
	await expect.element(page.getByText("56 in all")).toBeVisible();
});
