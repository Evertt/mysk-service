import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
import { createRawSnippet } from "svelte";
import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import StatTile from "#lib/components/stat-tile.svelte";

import Harness from "./stat-tile-card.test-harness.svelte";

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

test("card: the label above the value, and the detail below", async () => {
	render(StatTile, {
		layout: "card",
		size: "large",
		label: "Open orders",
		value: "12",
		detail: "3 without an engineer",
	});

	const label = page.getByText("Open orders").element();
	const value = page.getByText("12").element();
	const detail = page.getByText("3 without an engineer").element();

	expect(label.compareDocumentPosition(value)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	expect(value.compareDocumentPosition(detail)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	await expect.element(page.getByText("12")).toHaveClass("text-3xl", "tabular-nums");
});

test("card: no footer without a detail", async () => {
	const { container } = await render(StatTile, { layout: "card", label: "Orders", value: "1" });

	expect(container.querySelector('[data-slot="card-footer"]')).toBeNull();
});

test("card: a smaller value for the small size", async () => {
	render(StatTile, { layout: "card", label: "Orders", value: "1", size: "small" });

	await expect.element(page.getByText("1", { exact: true })).toHaveClass("text-2xl");
	await expect.element(page.getByText("1", { exact: true })).not.toHaveClass("text-3xl");
});

test("card: the action next to the value", async () => {
	render(StatTile, {
		layout: "card",
		label: "Low stock",
		value: "4",
		action: createRawSnippet(() => ({ render: () => '<a href="/materials">View</a>' })),
	});

	await expect
		.element(page.getByRole("link", { name: "View" }))
		.toHaveAttribute("href", "/materials");
});

test("card: fits the dashboard's grid at any width, in a link or with an action, and settles", async () => {
	const frames = async (count: number) => {
		for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame);
	};
	const { container, rerender } = await render(Harness, { width: 1000 });
	const grid = container.querySelector<HTMLElement>("[data-stat-grid]")!;
	const titles = [...grid.querySelectorAll<HTMLElement>('[data-slot="card-title"]')];
	await document.fonts.ready;
	const squeezed = new Set<number>();
	let changes = 0;
	const observer = new MutationObserver((records) => (changes += records.length));
	for (const title of titles) {
		observer.observe(title, { attributes: true, attributeFilter: ["style"] });
	}

	// From a phone's width to a wide screen's: one tile a row, two, three, four.
	for (let width = 300; width <= 1000; width += 23) {
		await rerender({ width });
		await frames(3);
		for (const title of titles) {
			const tile = title.closest<HTMLElement>('[data-slot="card"]')!;
			// Within the grid, and the number within its tile (or squeezed as far as it goes).
			expect(tile.getBoundingClientRect().right).toBeLessThanOrEqual(
				grid.getBoundingClientRect().right + 1,
			);
			const fits = title.scrollWidth <= title.clientWidth + 1;
			expect(fits || title.style.fontSize !== "").toBe(true);
			if (title.style.fontSize) squeezed.add(width);
		}
		changes = 0;
		await frames(10);
		expect(changes, `still squeezing at ${width}px`).toBe(0);
	}
	observer.disconnect();
	// Some widths are tight enough to squeeze, some not.
	expect(squeezed.size).toBeGreaterThan(0);
	expect(squeezed.size).toBeLessThan(31);
});

test("figure: no box, the label above the value in the tone's colour, the detail below", async () => {
	const { container } = await render(StatTile, {
		layout: "figure",
		tone: "danger",
		label: "Overdue",
		value: "€1,200.00",
		detail: "3 invoices",
	});

	const tile = container.querySelector("[data-stat-tile]")!;
	expect(tile.querySelector('[data-slot="card"]')).toBeNull();
	const order = ["Overdue", "€1,200.00", "3 invoices"].map((text) =>
		page.getByText(text).element(),
	);
	expect(order[0].compareDocumentPosition(order[1])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	expect(order[1].compareDocumentPosition(order[2])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	await expect.element(page.getByText("€1,200.00")).toHaveClass("text-destructive");
});

test("card: what it's given goes in the footer, after the detail", async () => {
	render(StatTile, {
		layout: "card",
		label: "Orders",
		value: "12",
		detail: "4 open",
		children: createRawSnippet(() => ({ render: () => "<ul><li>Repair 8</li></ul>" })),
	});

	const detail = page.getByText("4 open").element();
	const list = page.getByText("Repair 8").element();
	expect(detail.compareDocumentPosition(list)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	expect(list.closest('[data-slot="card-footer"]')).not.toBeNull();
});
