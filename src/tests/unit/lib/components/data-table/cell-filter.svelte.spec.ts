import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { toggleSearch, toggleValue } from "#lib/components/data-table/cell-filter.svelte.ts";

import Harness, { type Site } from "./cell-filter.test-harness.svelte";
import { lastSearch, visit } from "./fake-navigation.svelte.ts";

// The table keeps its state in the URL: a fake one, which `goto` changes.
vi.mock("$app/state", async () => ({ page: (await import("./fake-navigation.svelte.ts")).page }));
vi.mock("$app/navigation", async () => ({
	goto: (await import("./fake-navigation.svelte.ts")).goto,
}));
vi.mock("#lib/components/data-table/views.remote.ts", () => import("./fake-views.svelte.ts"));
vi.mock(
	"#lib/components/data-table/table-memory.remote.ts",
	() => import("./fake-table-memory.ts"),
);

const sites: Site[] = [
	{ id: 1, name: "Depot", status: "open", city: "Utrecht", country: "NL" },
	{ id: 2, name: "Harbour", status: "closed", city: "Antwerp", country: "BE" },
	{ id: 3, name: "Plant", status: "open", city: "Utrecht", country: "NL" },
	{ id: 4, name: "Yard", status: null, city: "Ghent", country: "BE" },
];

beforeEach(() => visit("/items"));

/** The names in the rows shown, in order. */
const names = () =>
	[...document.querySelectorAll<HTMLTableRowElement>("tbody tr")].map(
		(row) => row.cells[0]?.textContent?.trim() ?? "",
	);

/** The button of a value in the row of the site `name`. */
const valueIn = (name: string, label: string | RegExp) =>
	page.getByRole("row").filter({ hasText: name }).getByRole("button", { name: label });

describe("toggling", () => {
	test("a value is added to a set filter, or taken out if it's there", () => {
		expect(toggleValue(undefined, "open")).toEqual(["open"]);
		expect(toggleValue(["closed"], "open")).toEqual(["closed", "open"]);
		expect(toggleValue(["closed", "open"], "open")).toEqual(["closed"]);
		expect(toggleValue(["open"], "open")).toBeUndefined();
	});

	test("the search takes the value instead of what's in it, or clears if it's the value", () => {
		expect(toggleSearch("", "Utrecht")).toBe("Utrecht");
		expect(toggleSearch("depot", "Utrecht")).toBe("Utrecht");
		expect(toggleSearch("Utrecht", "Utrecht")).toBe("");
		expect(toggleSearch(" Utrecht ", "Utrecht")).toBe("");
	});
});

describe("clicking a value", () => {
	test("filters the column by it, into the URL, and clicking it again stops", async () => {
		render(Harness, { sites });

		await valueIn("Depot", "Filter by Open").click();
		await expect.poll(names).toEqual(["Depot", "Plant"]);
		await expect.poll(lastSearch).toBe("?status=open");
		// The toolbar shows the filter, as if it had been ticked there.
		await expect.element(page.getByRole("button", { name: /^Status.*Open/ })).toBeVisible();

		await valueIn("Plant", "Stop filtering by Open").click();
		await expect.poll(names).toEqual(["Depot", "Harbour", "Plant", "Yard"]);
		await expect.poll(lastSearch).toBe("");
	});

	test("a cell without a value is no button", async () => {
		render(Harness, { sites });

		await expect.element(valueIn("Harbour", "Filter by Closed")).toBeVisible();
		const yard = page.getByRole("row").filter({ hasText: "Yard" });
		expect(yard.getByRole("button", { name: /^Filter by (Open|Closed)/ }).elements()).toHaveLength(
			0,
		);
	});

	test("the detail line filters its own column, the city goes in the search box", async () => {
		render(Harness, { sites });

		await valueIn("Harbour", "Filter by Belgium").click();
		await expect.poll(names).toEqual(["Harbour", "Yard"]);
		await expect.poll(lastSearch).toBe("?country=BE");

		await valueIn("Harbour", "Stop filtering by Belgium").click();
		await valueIn("Depot", "Search for Utrecht").click();
		await expect
			.element(page.getByRole("textbox", { name: "Search sites…" }))
			.toHaveValue("Utrecht");
		await expect.poll(names).toEqual(["Depot", "Plant"]);

		await valueIn("Plant", "Clear the search").click();
		await expect.element(page.getByRole("textbox", { name: "Search sites…" })).toHaveValue("");
		await expect.poll(names).toHaveLength(4);
	});

	test("works with the keyboard, and a link stays a link", async () => {
		render(Harness, { sites });

		await expect
			.element(page.getByRole("link", { name: "Depot" }))
			.toHaveAttribute("href", "/sites/1");
		(valueIn("Harbour", "Filter by Closed").element() as HTMLElement).focus();
		await userEvent.keyboard("{Enter}");
		await expect.poll(names).toEqual(["Harbour"]);
		(valueIn("Harbour", "Stop filtering by Closed").element() as HTMLElement).focus();
		await userEvent.keyboard(" ");
		await expect.poll(names).toHaveLength(4);
	});

	test("the value has a tooltip saying what clicking does", async () => {
		render(Harness, { sites });

		await expect
			.element(valueIn("Depot", "Filter by Open"))
			.toHaveAttribute("title", "Filter by Open");
	});
});
