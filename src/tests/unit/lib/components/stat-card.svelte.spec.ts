import { createRawSnippet } from "svelte";
import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import StatCard from "#lib/components/stat-card.svelte";

import Harness from "./stat-card.test-harness.svelte";

test("shows the label above the value, and the detail below", async () => {
	render(StatCard, { label: "Open orders", value: "12", detail: "3 without an engineer" });

	const label = page.getByText("Open orders").element();
	const value = page.getByText("12").element();
	const detail = page.getByText("3 without an engineer").element();

	expect(label.compareDocumentPosition(value)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	expect(value.compareDocumentPosition(detail)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	await expect.element(page.getByText("12")).toHaveClass("text-3xl", "tabular-nums");
});

test("leaves out the footer when there is no detail", async () => {
	const { container } = await render(StatCard, { label: "Orders", value: "1" });

	expect(container.querySelector('[data-slot="card-footer"]')).toBeNull();
});

test("shows a smaller value for the small size", async () => {
	render(StatCard, { label: "Orders", value: "1", size: "small" });

	await expect.element(page.getByText("1", { exact: true })).toHaveClass("text-2xl");
	await expect.element(page.getByText("1", { exact: true })).not.toHaveClass("text-3xl");
});

test("renders the action next to the value", async () => {
	render(StatCard, {
		label: "Low stock",
		value: "4",
		action: createRawSnippet(() => ({ render: () => '<a href="/materials">View</a>' })),
	});

	await expect
		.element(page.getByRole("link", { name: "View" }))
		.toHaveAttribute("href", "/materials");
});

test("fits the dashboard's grid at any width, in a link or with an action, and settles", async () => {
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
