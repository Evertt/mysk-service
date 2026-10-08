import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
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

/** A column's header button, which opens its menu (its name goes on to say how it's sorted). */
const columnMenu = (name: string) =>
	page
		.getByRole("row")
		.first()
		.getByRole("button", { name: new RegExp(`^${name}( sorted|$)`) });

/** Shift-clicks a column's header, which adds it to the sort or turns it around there. */
const addToSort = (name: string) => columnMenu(name).click({ modifiers: ["Shift"] });

/** The place a column's header shows in the sort order, if it shows one. */
const precedence = (name: string) => () =>
	columnMenu(name).element().querySelector("span[aria-hidden=true]")?.textContent?.trim();

/** Sorts by a column alone through its header menu. */
async function sortBy(name: string, direction: "Ascending" | "Descending") {
	await columnMenu(name).click();
	await page.getByRole("menuitem", { name: direction }).click();
}

/** The names in the rows, in order, sorted by amount (then as given). */
const byAmount = (names: string[]) =>
	names.toSorted(
		(a, b) =>
			items.find((item) => item.name === a)!.amount - items.find((item) => item.name === b)!.amount,
	);

/** An option of the faceted filter, named by its label (its accessible name ends in its count). */
const facet = (label: string) => page.getByRole("option", { name: new RegExp(`^${label}`) });

/**
 * The faceted filter's button, whose name grows with the selection. It comes before the column
 * header's button of the same name.
 */
const statusFilter = () => page.getByRole("button", { name: /^Status/ }).first();

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

	test("the column header menu sorts descending and back to ascending", async () => {
		render(Harness, { items });

		await columnMenu("Name").click();
		await page.getByRole("menuitem", { name: "Descending" }).click();
		await expect.poll(names).toEqual(byName.toReversed().slice(0, 5));

		await columnMenu("Name").click();
		await page.getByRole("menuitem", { name: "Ascending" }).click();
		await expect.poll(names).toEqual(byName.slice(0, 5));
	});

	test("a column that can only be hidden offers no sorting", async () => {
		render(Harness, { items });

		await columnMenu("Status").click();
		await expect.element(page.getByRole("menuitem", { name: "Hide column" })).toBeVisible();
		expect(page.getByRole("menuitem", { name: "Ascending" }).elements()).toHaveLength(0);
	});

	test("a column that can only be sorted offers no hiding", async () => {
		render(Harness, { items });

		await columnMenu("Name").click();
		await expect.element(page.getByRole("menuitem", { name: "Ascending" })).toBeVisible();
		expect(page.getByRole("menuitem", { name: "Hide column" }).elements()).toHaveLength(0);
	});

	test("a column that can neither sort nor hide has a plain label", async () => {
		render(Harness, { items });

		await expect.element(page.getByRole("row").first().getByText("Due")).toBeInTheDocument();
		expect(columnMenu("Due").elements()).toHaveLength(0);
	});
});

describe("sorting by more than one column", () => {
	test("shift-clicking a header goes ascending, descending, then unsorted", async () => {
		render(Harness, { items });

		// Sorted by name ascending to start with.
		await addToSort("Name");
		await expect.poll(names).toEqual(byName.toReversed().slice(0, 5));
		await expect.element(columnMenu("Name")).toHaveAccessibleName(/sorted descending/);

		await addToSort("Name");
		await expect.poll(names).toEqual(items.slice(0, 5).map((item) => item.name));
		expect(columnMenu("Name").element().textContent).not.toMatch(/sorted/);
		await expect.element(page.getByRole("menu")).not.toBeInTheDocument();

		await addToSort("Name");
		await expect.poll(names).toEqual(byName.slice(0, 5));
	});

	test("the menu clears a column's sorting", async () => {
		render(Harness, { items });

		await columnMenu("Name").click();
		await page.getByRole("menuitem", { name: "Clear sorting" }).click();
		await expect.poll(names).toEqual(items.slice(0, 5).map((item) => item.name));

		await columnMenu("Name").click();
		await expect.element(page.getByRole("menuitem", { name: "Ascending" })).toBeVisible();
		expect(page.getByRole("menuitem", { name: "Clear sorting" }).elements()).toHaveLength(0);
	});

	test("shift-clicking adds a column to the sort, numbered by precedence", async () => {
		render(Harness, { items });

		await sortBy("Amount", "Ascending");
		await addToSort("Name");
		// The four at €1.00 by name, after the one at €0.00.
		await expect.poll(names).toEqual(byAmount(byName).slice(0, 5));
		await expect.poll(precedence("Amount")).toBe("1");
		await expect.poll(precedence("Name")).toBe("2");
		await expect
			.element(columnMenu("Name"))
			.toHaveAccessibleName("Name sorted ascending, sort 2 of 2");

		// Turned around within the sort, keeping its place.
		await addToSort("Name");
		await expect.poll(names).toEqual(byAmount(byName.toReversed()).slice(0, 5));
		await expect.poll(precedence("Name")).toBe("2");

		// A plain choice from the menu sorts by that column alone.
		await sortBy("Name", "Ascending");
		await expect.poll(names).toEqual(byName.slice(0, 5));
		await expect.element(columnMenu("Amount")).toHaveAccessibleName("Amount");
		await expect.element(columnMenu("Name")).toHaveAccessibleName("Name sorted ascending");
		expect(precedence("Name")()).toBeUndefined();
	});

	test("shift+Enter on a header adds it to the sort from the keyboard", async () => {
		render(Harness, { items });

		await sortBy("Amount", "Descending");
		columnMenu("Name").element().focus();
		await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
		await expect.poll(precedence("Name")).toBe("2");
		await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
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

		await sortBy("Amount", "Descending");
		const filtered = "?status=open,draft,closed";
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
		await expect.element(columnMenu("Amount")).toHaveAccessibleName(/sorted descending/);
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
	test("the column header menu hides its column", async () => {
		render(Harness, { items });

		await columnMenu("Amount").click();
		await page.getByRole("menuitem", { name: "Hide column" }).click();

		await expect.poll(headers).not.toContain("Amount");
		await expect.element(page.getByText("€1,234.56")).not.toBeInTheDocument();
	});

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
