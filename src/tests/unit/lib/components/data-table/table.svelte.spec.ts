import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { lastSearch, visit } from "./fake-navigation.svelte.ts";
import Harness from "./table.test-harness.svelte";
import {
	addToSort,
	byName,
	columnHeader,
	facet,
	filterButton,
	items,
	names,
	openStatusFilter,
	statusPill,
	textOf,
} from "./table.test-support.ts";

// The table keeps its state in the URL: a fake one, which `goto` changes.
vi.mock("$app/state", async () => ({ page: (await import("./fake-navigation.svelte.ts")).page }));
vi.mock("$app/navigation", async () => ({
	goto: (await import("./fake-navigation.svelte.ts")).goto,
}));
// The toolbar's saved views (see `saved-views.svelte.spec.ts`): none.
vi.mock("#lib/components/data-table/views.remote.ts", () => import("./fake-views.svelte.ts"));
vi.mock(
	"#lib/components/data-table/table-memory.remote.ts",
	() => import("./fake-table-memory.ts"),
);

beforeEach(() => visit("/items"));

/** The cell of a row (by its name) in the column at `index`. */
const cell = (name: string, index: number) =>
	page.getByRole("row").filter({ hasText: name }).getByRole("cell").nth(index);

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

const headers = () =>
	[...document.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");

describe("headers", () => {
	// The harness's columns name no header: the table's defaults make them.
	test("a data column gets a sortable header, as long as it can be sorted", async () => {
		render(Harness, { items });

		await expect.element(columnHeader("Amount")).toBeVisible();
		await expect.element(columnHeader("Quantity")).toBeVisible();
		// Not sortable: a plain label.
		expect(headers()).toContain("Status");
		expect(columnHeader("Status").elements()).toHaveLength(0);
	});

	test("the selection column has a checkbox to select the page, and the actions column no header", async () => {
		render(Harness, { items });

		const head = [...document.querySelectorAll("thead th")];
		await expect.element(page.getByRole("checkbox", { name: /select all/i })).toBeVisible();
		expect(head.at(0)?.querySelector("[role=checkbox]")).not.toBeNull();
		expect(head.at(-1)?.textContent?.trim()).toBe("");
		expect(head.at(-1)?.children).toHaveLength(0);
	});
});

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
		await expect.element(time).toHaveAttribute("datetime", "2026-03-01");
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

describe("column visibility", () => {
	test("the view menu lists the hideable columns and toggles them", async () => {
		render(Harness, { items });

		await page.getByRole("button", { name: "View", exact: true }).click();
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

	test("the Filter menu lists the filters, and a picked one shows how many rows have each value", async () => {
		render(Harness, { items });

		await filterButton().click();
		await expect.element(page.getByRole("option", { name: "Status" })).toBeVisible();
		await page.getByRole("option", { name: "Status" }).click();

		await expect.poll(textOf(facet("Draft"))).toBe("Draft 2");
		await expect.poll(textOf(facet("Open"))).toBe("Open 3");
		await expect.poll(textOf(facet("Closed"))).toBe("Closed 2");
		await expect.element(page.getByPlaceholder("Status")).toHaveFocus();

		// Back to the list, where the filter now shows its selection.
		await facet("Draft").click();
		await page.getByRole("button", { name: "Back to all filters" }).click();
		await expect.poll(textOf(page.getByRole("option", { name: /^Status/ }))).toBe("Status Draft");
	});

	test("the faceted filter keeps rows with any of the selected values", async () => {
		render(Harness, { items });

		await openStatusFilter();
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

	test("the faceted filter offers the rows without a value first, and keeps them by `none`", async () => {
		const unstarted = {
			id: 8,
			name: "Valve check",
			status: null,
			amount: 0,
			quantity: 1,
			dueOn: null,
		};
		render(Harness, { items: [...items, unstarted] });

		await openStatusFilter();
		await expect.poll(textOf(page.getByRole("option").first())).toBe("(None) 1");

		await facet("\\(None\\)").click();
		await expect.poll(lastSearch).toBe("?status=none");
		await expect.poll(names).toEqual(["Valve check"]);
		await expect.poll(textOf(statusPill())).toBe("Status (None)");

		await facet("Draft").click();
		await expect.poll(names).toEqual(["Compressor overhaul", "Elevator inspection", "Valve check"]);
	});

	test("an active filter is a pill naming the selection, and Clear filters takes it away", async () => {
		render(Harness, { items });

		expect(statusPill().elements()).toHaveLength(0);
		await openStatusFilter();
		await facet("Draft").click();
		await expect.poll(textOf(statusPill())).toBe("Status Draft");

		await facet("Open").click();
		await expect.poll(textOf(statusPill())).toBe("Status Draft, Open");
		await facet("Closed").click();
		await expect.poll(textOf(statusPill())).toBe("Status 3 selected");

		await page.getByRole("option", { name: "Clear filters" }).click();
		await expect.element(statusPill()).not.toBeInTheDocument();
		await expect.poll(names).toEqual(byName.slice(0, 5));
	});

	test("the pill reopens the filter's values, and its remove button clears it", async () => {
		render(Harness, { items });

		await openStatusFilter();
		await facet("Closed").click();
		await userEvent.keyboard("{Escape}");
		await expect.poll(names).toEqual(["Chiller repair", "Pump replacement"]);

		await statusPill().click();
		await facet("Draft").click();
		await expect.poll(textOf(statusPill())).toBe("Status Draft, Closed");
		await userEvent.keyboard("{Escape}");

		await page.getByRole("button", { name: "Remove the Status filter" }).click();
		await expect.element(statusPill()).not.toBeInTheDocument();
		await expect.element(page.getByRole("button", { name: "Reset" })).not.toBeInTheDocument();
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
