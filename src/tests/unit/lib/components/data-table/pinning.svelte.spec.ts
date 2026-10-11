import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { visit } from "./fake-navigation.svelte.ts";
import Harness from "./table.test-harness.svelte";
import { items } from "./table.test-support.ts";

// The table keeps its state in the URL: a fake one, which `goto` changes.
vi.mock("$app/state", async () => ({ page: (await import("./fake-navigation.svelte.ts")).page }));
vi.mock("$app/navigation", async () => ({
	goto: (await import("./fake-navigation.svelte.ts")).goto,
}));
// The toolbar's saved views (see `saved-views.svelte.spec.ts`): none.
vi.mock("./views.remote.ts", () => import("./fake-views.svelte.ts"));

beforeEach(() => visit("/items"));

describe("pinned columns", () => {
	// The tests that need columns pinned use a viewport wider than a phone's, but no wider than the
	// test browser's window, in which clicks would miss.
	afterEach(() => page.viewport(414, 896));

	/** Which side each cell of the header row, or of the first body row, is pinned to. */
	const pinning = (row: "thead" | "tbody") =>
		[...document.querySelectorAll<HTMLElement>(`${row} tr:first-child > *`)].map(
			(cell) => cell.dataset.pinned ?? "",
		);
	const headerCell = (index: number) => document.querySelectorAll<HTMLElement>("thead th")[index];
	const bodyCell = (index: number) =>
		document.querySelector("tbody tr")!.querySelectorAll<HTMLElement>("td")[index];
	const style = (element: Element, pseudo?: string) => getComputedStyle(element, pseudo);

	test("the selection and identifying columns stick to the start, the actions to the end", async () => {
		await page.viewport(800, 600);
		render(Harness, { items });

		const pinned = ["start", "start", "", "", "", "", "end"];
		await expect.poll(() => pinning("thead")).toEqual(pinned);
		expect(pinning("tbody")).toEqual(pinned);

		for (const cell of [headerCell(1), bodyCell(1), bodyCell(6)]) {
			expect(style(cell).position).toBe("sticky");
		}
		expect(style(bodyCell(2)).position).not.toBe("sticky");
		// The name column sits right after the selection column, the actions at the very end.
		await expect
			.poll(() => style(bodyCell(1)).insetInlineStart)
			.toBe(`${headerCell(0).getBoundingClientRect().width}px`);
		expect(style(bodyCell(0)).insetInlineStart).toBe("0px");
		expect(style(bodyCell(6)).insetInlineEnd).toBe("0px");
		// Pinned header cells stay above the other header cells, which stay above the rows.
		expect(Number(style(headerCell(1)).zIndex)).toBeGreaterThan(
			Number(style(headerCell(2)).zIndex),
		);
		expect(Number(style(headerCell(2)).zIndex)).toBeGreaterThan(Number(style(bodyCell(1)).zIndex));
	});

	test("the header row sticks to the top", async () => {
		render(Harness, { items });

		await expect.element(page.getByText("Boiler service")).toBeInTheDocument();
		for (const cell of document.querySelectorAll("thead th")) {
			expect(style(cell).position).toBe("sticky");
			expect(style(cell).top).toBe("0px");
		}
	});

	test("pinned cells are opaque, in the colour of their row", async () => {
		await page.viewport(800, 600);
		render(Harness, { items });

		await page.getByRole("checkbox", { name: "Select row" }).first().click();
		const row = page.getByRole("row").filter({ hasText: "Air handler check" });
		await expect.element(row).toHaveAttribute("data-state", "selected");
		const cell = row.getByRole("cell").nth(1).element();
		const rowColour = style(row.element()).backgroundColor;
		expect(rowColour).not.toBe("rgba(0, 0, 0, 0)");
		// The row's colour, over an opaque layer of the table's background.
		expect(style(cell).backgroundColor).toBe(rowColour);
		expect(style(cell, "::before").backgroundColor).toBe(rowColour);
		expect(style(cell).backgroundImage).toMatch(/^linear-gradient/);
	});

	test("an edge shadow shows while there's more to scroll to that side", async () => {
		await page.viewport(800, 600);
		render(Harness, { items });
		const root = document.querySelector<HTMLElement>('[data-slot="data-table"]')!;
		const area = root.querySelector<HTMLElement>('[data-slot="table-container"]')!;
		await expect.poll(() => headerCell(1).dataset.pinned).toBe("start");
		const shadow = (cell: () => HTMLElement) => () => style(cell(), "::after").opacity;

		expect(root.dataset.overflowEnd).toBeUndefined();
		expect(shadow(() => headerCell(6))()).toBe("0");

		area.style.width = "320px";
		await expect.poll(() => root.dataset.overflowEnd).toBe("true");
		expect(root.dataset.overflowStart).toBeUndefined();
		await expect.poll(shadow(() => headerCell(6))).toBe("1");
		expect(shadow(() => bodyCell(1))()).toBe("0");

		area.scrollLeft = area.scrollWidth;
		await expect.poll(() => root.dataset.overflowStart).toBe("true");
		expect(root.dataset.overflowEnd).toBeUndefined();
		await expect.poll(shadow(() => bodyCell(1))).toBe("1");
		await expect.poll(shadow(() => headerCell(6))).toBe("0");
	});

	test("a table can start without pinned columns", async () => {
		await page.viewport(800, 600);
		render(Harness, { items, columnPinning: { start: [], end: [] } });

		await expect.element(page.getByText("Boiler service")).toBeInTheDocument();
		expect(pinning("tbody")).toEqual(["", "", "", "", "", "", ""]);
		expect(style(bodyCell(1)).position).not.toBe("sticky");
	});

	test("on a phone nothing sticks sideways", async () => {
		await page.viewport(390, 844);
		render(Harness, { items });

		await expect.poll(() => pinning("tbody")).toEqual(["start", "start", "", "", "", "", "end"]);
		expect(style(bodyCell(1)).position).not.toBe("sticky");
		expect(style(bodyCell(6)).position).not.toBe("sticky");
	});
});
