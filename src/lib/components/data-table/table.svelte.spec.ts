import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { type Locator, page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { lastSearch, visit, visits } from "./fake-navigation.svelte.ts";
import Harness, { type Item } from "./table.test-harness.svelte";

// The table keeps its state in the URL: a fake one, which `goto` changes.
vi.mock("$app/state", async () => ({ page: (await import("./fake-navigation.svelte.ts")).page }));
vi.mock("$app/navigation", async () => ({
	goto: (await import("./fake-navigation.svelte.ts")).goto,
}));

beforeEach(() => visit("/items"));

const items: Item[] = [
	{
		id: 1,
		name: "Boiler service",
		status: "open",
		amount: 123456,
		quantity: 1,
		dueOn: new Date(2026, 2, 1),
	},
	{ id: 2, name: "Chiller repair", status: "closed", amount: 0, quantity: 0, dueOn: null },
	{ id: 3, name: "Air handler check", status: "open", amount: 5000, quantity: 3, dueOn: null },
	{ id: 4, name: "Elevator inspection", status: "draft", amount: 100, quantity: 2, dueOn: null },
	{ id: 5, name: "Generator install", status: "open", amount: 100, quantity: 2, dueOn: null },
	{ id: 6, name: "Pump replacement", status: "closed", amount: 100, quantity: 2, dueOn: null },
	{ id: 7, name: "Compressor overhaul", status: "draft", amount: 100, quantity: 2, dueOn: null },
];

const byName = [...items].map((item) => item.name).sort((a, b) => a.localeCompare(b));

/** The names in the rows on the current page, in order. */
const names = () =>
	[...document.querySelectorAll<HTMLTableRowElement>("tbody tr")].map(
		(row) => row.cells[1]?.textContent?.trim() ?? "",
	);

/** The cell of a row (by its name) in the column at `index`. */
const cell = (name: string, index: number) =>
	page.getByRole("row").filter({ hasText: name }).getByRole("cell").nth(index);

/** A column's header button, which sorts by it (its name goes on to say how it's sorted). */
const columnHeader = (name: string) =>
	page
		.getByRole("row")
		.first()
		.getByRole("button", { name: new RegExp(`^${name}( sorted|$)`) });

/** Shift-clicks a column's header, which adds it to the sort or turns it around there. */
const addToSort = (name: string) => columnHeader(name).click({ modifiers: ["Shift"] });

/** The place a column's header shows in the sort order, if it shows one. */
const precedence = (name: string) => () =>
	columnHeader(name).element().querySelector("span[aria-hidden=true]")?.textContent?.trim();

/** Sorts by a column alone, clicking its header until it's sorted that way. */
async function sortBy(name: string, direction: "ascending" | "descending") {
	for (let clicks = 0; clicks < 3; clicks++) {
		const before = textOf(columnHeader(name))();
		if (before === `${name} sorted ${direction}`) return;
		await columnHeader(name).click();
		await expect.poll(textOf(columnHeader(name))).not.toBe(before);
	}
	await expect.element(columnHeader(name)).toHaveAccessibleName(`${name} sorted ${direction}`);
}

/** The names in the rows, in order, sorted by amount (then as given). */
const byAmount = (names: string[]) =>
	names.toSorted(
		(a, b) =>
			items.find((item) => item.name === a)!.amount - items.find((item) => item.name === b)!.amount,
	);

/** An option of the faceted filter, named by its label (its accessible name ends in its count). */
const facet = (label: string) => page.getByRole("option", { name: new RegExp(`^${label}`) });

/** The faceted filter's button, whose name grows with the selection. */
const statusFilter = () => page.getByRole("button", { name: /^Status/ });

/** Reads a locator's text with its whitespace collapsed, for `expect.poll`. */
const textOf = (locator: Locator) => () =>
	locator.element().textContent?.replace(/\s+/g, " ").trim();

const headers = () =>
	[...document.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");

describe("cells", () => {
	test("an amount in cents is shown in euros, right-aligned", async () => {
		render(Harness, { items });

		await expect.element(cell("Boiler service", 3)).toHaveTextContent("€1,234.56");
		await expect
			.element(cell("Boiler service", 3).getByText("€1,234.56"))
			.toHaveClass("text-right");
	});

	test("a count gets its unit, singular or plural, and is muted when zero", async () => {
		render(Harness, { items });

		await expect.poll(textOf(cell("Boiler service", 4))).toBe("1 unit");
		await expect.element(cell("Air handler check", 4)).toHaveTextContent("3 units");
		await expect
			.element(cell("Chiller repair", 4).getByText("0 units"))
			.toHaveClass("text-muted-foreground");
		await expect
			.element(cell("Air handler check", 4).getByText("3 units"))
			.not.toHaveClass("text-muted-foreground");
	});

	test("a date is shown as a machine-readable time, a missing one as a dash", async () => {
		render(Harness, { items });

		const time = cell("Boiler service", 5).getByText("1 Mar 2026");
		await expect.element(time).toHaveAttribute("datetime", new Date(2026, 2, 1).toISOString());
		await expect.element(cell("Chiller repair", 5)).toHaveTextContent("—");
	});
});

describe("sorting", () => {
	test("rows start in the initial sort order", async () => {
		render(Harness, { items });

		await expect.poll(names).toEqual(byName.slice(0, 5));
	});

	test("clicking a header goes descending, unsorted, then ascending, without a menu", async () => {
		render(Harness, { items });

		// Sorted by name ascending to start with.
		await expect.element(columnHeader("Name")).toHaveAccessibleName("Name sorted ascending");
		await columnHeader("Name").click();
		await expect.poll(names).toEqual(byName.toReversed().slice(0, 5));
		await expect.element(columnHeader("Name")).toHaveAccessibleName("Name sorted descending");
		expect(page.getByRole("menu").elements()).toHaveLength(0);

		await columnHeader("Name").click();
		await expect.poll(names).toEqual(items.slice(0, 5).map((item) => item.name));
		await expect.element(columnHeader("Name")).toHaveAccessibleName("Name");

		await columnHeader("Name").click();
		await expect.poll(names).toEqual(byName.slice(0, 5));
	});

	test("clicking another header sorts by that column alone, ascending", async () => {
		render(Harness, { items });

		await columnHeader("Amount").click();
		await expect.poll(names).toEqual(byAmount(items.map((item) => item.name)).slice(0, 5));
		await expect.element(columnHeader("Amount")).toHaveAccessibleName("Amount sorted ascending");
		await expect.element(columnHeader("Name")).toHaveAccessibleName("Name");
	});

	test("Enter and Space on a header sort from the keyboard", async () => {
		render(Harness, { items });

		columnHeader("Name").element().focus();
		await userEvent.keyboard("{Enter}");
		await expect.poll(names).toEqual(byName.toReversed().slice(0, 5));
		await userEvent.keyboard(" ");
		await expect.element(columnHeader("Name")).toHaveAccessibleName("Name");
	});

	test("the header explains how to sort by more than one column", async () => {
		render(Harness, { items });

		await expect
			.element(columnHeader("Amount"))
			.toHaveAttribute("title", "Click to sort; shift-click to sort by more than one column");
	});

	test("a column that can't be sorted has a plain label, also when it can be hidden", async () => {
		render(Harness, { items });

		const headerRow = page.getByRole("row").first();
		await expect.element(headerRow.getByText("Due")).toBeInTheDocument();
		expect(columnHeader("Due").elements()).toHaveLength(0);
		// Hidden from the View menu only.
		await expect.element(headerRow.getByText("Status")).toBeInTheDocument();
		expect(headerRow.getByRole("button", { name: "Status" }).elements()).toHaveLength(0);
	});
});

describe("sorting by more than one column", () => {
	test("shift-clicking a header goes ascending, descending, then unsorted", async () => {
		render(Harness, { items });

		// Sorted by name ascending to start with.
		await addToSort("Name");
		await expect.poll(names).toEqual(byName.toReversed().slice(0, 5));
		await expect.element(columnHeader("Name")).toHaveAccessibleName(/sorted descending/);

		await addToSort("Name");
		await expect.poll(names).toEqual(items.slice(0, 5).map((item) => item.name));
		expect(columnHeader("Name").element().textContent).not.toMatch(/sorted/);

		await addToSort("Name");
		await expect.poll(names).toEqual(byName.slice(0, 5));
	});

	test("shift-clicking adds a column to the sort, numbered by precedence", async () => {
		render(Harness, { items });

		await sortBy("Amount", "ascending");
		await addToSort("Name");
		// The four at €1.00 by name, after the one at €0.00.
		await expect.poll(names).toEqual(byAmount(byName).slice(0, 5));
		await expect.poll(precedence("Amount")).toBe("1");
		await expect.poll(precedence("Name")).toBe("2");
		await expect
			.element(columnHeader("Name"))
			.toHaveAccessibleName("Name sorted ascending, sort 2 of 2");

		// Turned around within the sort, keeping its place.
		await addToSort("Name");
		await expect.poll(names).toEqual(byAmount(byName.toReversed()).slice(0, 5));
		await expect.poll(precedence("Name")).toBe("2");

		// A plain click takes a column to its next direction and sorts by it alone.
		await columnHeader("Amount").click();
		await expect.element(columnHeader("Amount")).toHaveAccessibleName("Amount sorted descending");
		await expect.element(columnHeader("Name")).toHaveAccessibleName("Name");
		expect(precedence("Amount")()).toBeUndefined();
		expect(names()[0]).toBe("Boiler service");
	});

	test("shift+Enter on a header adds it to the sort from the keyboard", async () => {
		render(Harness, { items });

		await sortBy("Amount", "descending");
		columnHeader("Name").element().focus();
		await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
		await expect.poll(precedence("Name")).toBe("2");
		await expect.element(columnHeader("Amount")).toHaveAccessibleName(/sorted descending/);
	});
});

describe("the URL", () => {
	test("an untouched table leaves the URL alone", async () => {
		render(Harness, { items });

		await expect.poll(names).toEqual(byName.slice(0, 5));
		expect(visits).toEqual([]);
	});

	test("filtering, sorting and paging go into the URL, each as a history entry", async () => {
		render(Harness, { items });

		await statusFilter().click();
		await facet("Open").click();
		await facet("Draft").click();
		await expect.poll(lastSearch).toBe("?status=open,draft");
		await facet("Closed").click();
		await expect.poll(lastSearch).toBe("?status=open,draft,closed");
		await userEvent.keyboard("{Escape}");

		const filtered = "?status=open,draft,closed";
		await columnHeader("Amount").click();
		await expect.poll(lastSearch).toBe(`${filtered}&sort=amount`);
		await columnHeader("Amount").click();
		await expect.poll(lastSearch).toBe(`${filtered}&sort=-amount`);
		await addToSort("Name");
		await expect.poll(lastSearch).toBe(`${filtered}&sort=-amount,name`);

		await page.getByRole("button", { name: "Go to next page" }).click();
		await expect.poll(lastSearch).toBe(`${filtered}&sort=-amount,name&page=2`);
		await page.getByRole("button", { name: "Rows per page" }).click();
		await page.getByRole("option", { name: "10" }).click();
		await expect.poll(lastSearch).toBe(`${filtered}&sort=-amount,name&size=10`);

		expect(visits.every((visit) => !visit.replace)).toBe(true);
	});

	test("searching replaces its history entry once typing pauses, and goes to the first page", async () => {
		visit("/items?page=2");
		render(Harness, { items });
		await expect.element(page.getByText("Page 2 of 2")).toBeInTheDocument();

		const search = page.getByRole("textbox", { name: "Search items…" });
		await search.fill("p");
		await expect.poll(lastSearch).toBe("?q=p");
		await search.fill("pump");
		await expect.poll(lastSearch).toBe("?q=pump");
		await expect.poll(names).toEqual(["Pump replacement"]);
		expect(visits.map((visit) => visit.replace)).toEqual([false, true]);
	});

	test("a page from the URL shows, sorted and filtered as the URL says", async () => {
		visit("/items?status=draft,open,closed&sort=-amount,name&page=2&tab=notes");
		render(Harness, { items });

		await expect.element(page.getByText("Page 2 of 2")).toBeInTheDocument();
		await expect.poll(names).toEqual(["Pump replacement", "Chiller repair"]);
		await expect.poll(textOf(statusFilter())).toBe("Status 3 selected");
		await expect.element(columnHeader("Amount")).toHaveAccessibleName(/sorted descending/);
		expect(visits).toEqual([]);
	});

	test("invalid parameters are ignored", async () => {
		visit("/items?status=bogus&sort=nothing&page=-3&size=7");
		render(Harness, { items });

		await expect.element(page.getByText("Page 1 of 2")).toBeInTheDocument();
		await expect.poll(names).toEqual(byName.slice(0, 5));
		await expect.poll(textOf(statusFilter())).toBe("Status");
	});

	test("a page past the last becomes the last, replacing the history entry", async () => {
		visit("/items?page=9");
		render(Harness, { items });

		await expect.element(page.getByText("Page 2 of 2")).toBeInTheDocument();
		await expect.poll(lastSearch).toBe("?page=2");
		expect(visits.at(-1)?.replace).toBe(true);
	});

	test("going back to an earlier URL takes the table back", async () => {
		render(Harness, { items });

		await statusFilter().click();
		await facet("Closed").click();
		await expect.poll(lastSearch).toBe("?status=closed");
		await userEvent.keyboard("{Escape}");
		await expect.poll(names).toEqual(["Chiller repair", "Pump replacement"]);

		visit("/items", { clear: false });
		await expect.poll(names).toEqual(byName.slice(0, 5));
		await expect.poll(textOf(statusFilter())).toBe("Status");

		visit("/items?status=closed&sort=-name", { clear: false });
		await expect.poll(names).toEqual(["Pump replacement", "Chiller repair"]);
		// Following the URL doesn't change it again.
		expect(visits).toHaveLength(1);
	});

	test("Reset goes back to an unfiltered URL", async () => {
		visit("/items?q=pump&status=closed");
		render(Harness, { items });
		await expect.poll(names).toEqual(["Pump replacement"]);

		await page.getByRole("button", { name: "Reset" }).click();
		await expect.poll(lastSearch).toBe("");
		await expect.poll(names).toEqual(byName.slice(0, 5));
	});
});

describe("column visibility", () => {
	test("the view menu lists the hideable columns and toggles them", async () => {
		render(Harness, { items });

		await page.getByRole("button", { name: "View" }).click();
		const options = page.getByRole("menuitemcheckbox");
		await expect.element(options.first()).toBeVisible();
		expect(options.elements().map((option) => option.textContent?.trim())).toEqual([
			"Status",
			"Amount",
			"Quantity",
		]);

		await page.getByRole("menuitemcheckbox", { name: "Quantity" }).click();
		await expect.poll(headers).not.toContain("Quantity");
		await expect
			.element(page.getByRole("menuitemcheckbox", { name: "Quantity" }))
			.toHaveAttribute("aria-checked", "false");

		await page.getByRole("menuitemcheckbox", { name: "Quantity" }).click();
		await expect.poll(headers).toContain("Quantity");
	});
});

describe("filtering", () => {
	test("the search box filters the rows, and Reset clears it", async () => {
		render(Harness, { items });

		await page.getByRole("textbox", { name: "Search items…" }).fill("pump");
		await expect.poll(names).toEqual(["Pump replacement"]);

		await page.getByRole("button", { name: "Reset" }).click();
		await expect.poll(names).toEqual(byName.slice(0, 5));
		await expect.element(page.getByRole("textbox", { name: "Search items…" })).toHaveValue("");
		await expect.element(page.getByRole("button", { name: "Reset" })).not.toBeInTheDocument();
	});

	test("a search without matches shows the empty state", async () => {
		render(Harness, { items });

		await page.getByRole("textbox", { name: "Search items…" }).fill("nothing like this");

		await expect.element(page.getByText("No items found")).toBeVisible();
		await expect.element(page.getByText("0 rows")).toBeInTheDocument();
	});

	test("the faceted filter shows how many rows have each value", async () => {
		render(Harness, { items });

		await statusFilter().click();

		await expect.poll(textOf(facet("Draft"))).toBe("Draft 2");
		await expect.poll(textOf(facet("Open"))).toBe("Open 3");
		await expect.poll(textOf(facet("Closed"))).toBe("Closed 2");
	});

	test("the faceted filter keeps rows with any of the selected values", async () => {
		render(Harness, { items });

		await statusFilter().click();
		await facet("Draft").click();
		await expect.poll(names).toEqual(["Compressor overhaul", "Elevator inspection"]);

		await facet("Closed").click();
		await expect
			.poll(names)
			.toEqual([
				"Chiller repair",
				"Compressor overhaul",
				"Elevator inspection",
				"Pump replacement",
			]);
	});

	test("the faceted filter's button shows the selection, and Clear filters resets it", async () => {
		render(Harness, { items });

		const trigger = statusFilter();
		await trigger.click();
		await facet("Draft").click();
		await expect.poll(textOf(trigger)).toBe("Status Draft");

		await facet("Open").click();
		await facet("Closed").click();
		await expect.poll(textOf(trigger)).toBe("Status 3 selected");

		await page.getByRole("option", { name: "Clear filters" }).click();
		await expect.poll(textOf(trigger)).toBe("Status");
		await expect.poll(names).toEqual(byName.slice(0, 5));
	});
});

describe("pagination", () => {
	test("shows the row count and pages through the rows", async () => {
		render(Harness, { items });

		await expect.element(page.getByText("7 rows")).toBeInTheDocument();
		await expect.element(page.getByText("Page 1 of 2")).toBeInTheDocument();
		await expect.element(page.getByRole("button", { name: "Go to previous page" })).toBeDisabled();

		await page.getByRole("button", { name: "Go to next page" }).click();
		await expect.element(page.getByText("Page 2 of 2")).toBeInTheDocument();
		await expect.poll(names).toEqual(byName.slice(5));
		await expect.element(page.getByRole("button", { name: "Go to next page" })).toBeDisabled();

		await page.getByRole("button", { name: "Go to previous page" }).click();
		await expect.element(page.getByText("Page 1 of 2")).toBeInTheDocument();
	});

	test("more rows per page show more rows on fewer pages", async () => {
		render(Harness, { items });

		await page.getByRole("button", { name: "Rows per page" }).click();
		await page.getByRole("option", { name: "10" }).click();

		await expect.element(page.getByText("Page 1 of 1")).toBeInTheDocument();
		await expect.poll(names).toEqual(byName);
	});

	test("an empty table still has a page", async () => {
		render(Harness, { items: [] });

		await expect.element(page.getByText("Page 1 of 1")).toBeInTheDocument();
		await expect.element(page.getByText("No items found")).toBeVisible();
	});
});

describe("row selection", () => {
	test("selecting a row marks it and counts it", async () => {
		render(Harness, { items });

		await page.getByRole("checkbox", { name: "Select row" }).nth(1).click();

		await expect
			.element(page.getByRole("row").filter({ hasText: "Boiler service" }))
			.toHaveAttribute("data-state", "selected");
		await expect.element(page.getByText("1 of 7 rows selected")).toBeInTheDocument();
		await expect
			.element(page.getByRole("checkbox", { name: "Select all rows on this page" }))
			.toHaveAttribute("aria-checked", "mixed");
	});

	test("the header checkbox selects every row on the page", async () => {
		render(Harness, { items });

		await page.getByRole("checkbox", { name: "Select all rows on this page" }).click();

		await expect.element(page.getByText("5 of 7 rows selected")).toBeInTheDocument();
		await expect
			.element(page.getByRole("checkbox", { name: "Select all rows on this page" }))
			.toBeChecked();

		await page.getByRole("checkbox", { name: "Select all rows on this page" }).click();
		await expect.element(page.getByText("7 rows")).toBeInTheDocument();
	});
});

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
