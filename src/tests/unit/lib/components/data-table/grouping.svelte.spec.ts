import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { lastSearch, visit } from "./fake-navigation.svelte.ts";
import Harness, { type Item } from "./table.test-harness.svelte";

// The table keeps its state in the URL: a fake one, which `goto` changes.
vi.mock("$app/state", async () => ({ page: (await import("./fake-navigation.svelte.ts")).page }));
vi.mock("$app/navigation", async () => ({
	goto: (await import("./fake-navigation.svelte.ts")).goto,
}));
// The toolbar's saved views (see `saved-views.svelte.spec.ts`): none.
vi.mock("#lib/components/data-table/views.remote.ts", () => import("./fake-views.svelte.ts"));

beforeEach(() => visit("/items"));

const items: Item[] = [
	{ id: 1, name: "Boiler service", status: "open", amount: 1000, quantity: 1, dueOn: null },
	{ id: 2, name: "Chiller repair", status: "closed", amount: 0, quantity: 0, dueOn: null },
	{ id: 3, name: "Air handler check", status: "open", amount: 5000, quantity: 3, dueOn: null },
	{ id: 4, name: "Elevator inspection", status: "draft", amount: 100, quantity: 2, dueOn: null },
	{ id: 5, name: "Generator install", status: "open", amount: 200, quantity: 2, dueOn: null },
	{ id: 6, name: "Pump replacement", status: "closed", amount: 300, quantity: 2, dueOn: null },
	{ id: 7, name: "Compressor overhaul", status: "draft", amount: 400, quantity: 2, dueOn: null },
];

/**
 * The body's rows in order: a group's header row as `[status, count, notes…]`, and an item's as
 * its name.
 */
const shown = () =>
	[...document.querySelectorAll<HTMLTableRowElement>("tbody tr")].map((row) => {
		if (row.dataset.group === undefined) return row.cells[1]?.textContent?.trim() ?? "";
		const notes = [...row.querySelectorAll("[data-group-note]")].map((note) =>
			note.textContent?.trim(),
		);
		const count = row.querySelector("[data-group-count]")?.textContent?.trim();
		return [row.dataset.group, count, ...notes].join(" | ");
	});

/** A group's toggle, named by the group. */
const toggle = (status: string) => page.getByRole("button", { name: status, exact: true });

/** A group's header row, by its status. */
const groupRow = (status: string) => page.getByRole("row").filter({ has: toggle(status) });

/** The column headers' texts. */
const headers = () =>
	[...document.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");

async function openViewMenu() {
	await page.getByRole("button", { name: "View", exact: true }).click();
}

async function groupBy(column: string) {
	await openViewMenu();
	await page.getByRole("menuitem", { name: "Group by" }).click();
	await page.getByRole("menuitemradio", { name: column }).click();
	await userEvent.keyboard("{Escape}");
}

describe("grouping", () => {
	test("the View menu groups the rows by a column, into the URL", async () => {
		render(Harness, { items });

		await groupBy("Status");
		await expect.poll(lastSearch).toBe("?group=status");
		// By name, the groups in the order they come (statuses can't be sorted), 5 rows per page.
		await expect
			.poll(shown)
			.toEqual([
				"open | 3",
				"Air handler check",
				"Boiler service",
				"Generator install",
				"closed | 2",
				"Chiller repair",
				"Pump replacement",
			]);
		// The rows leave the status out: their group shows it.
		expect(headers()).not.toContain("Status");
		await expect.element(groupRow("open")).toMatchTextContent(/\b3 rows in this group\b/);

		await page.getByRole("button", { name: "Go to next page" }).click();
		await expect.poll(shown).toEqual(["draft | 2", "Compressor overhaul", "Elevator inspection"]);

		await groupBy("None");
		await expect.poll(lastSearch).toBe("");
		await expect.poll(headers).toContain("Status");
	});

	test("a group across pages counts all its rows, and says it goes on", async () => {
		// Closed (0, 300), draft (100, 400), then open (200, 1000, 5000): over two pages.
		visit("/items?group=status&sort=amount");
		render(Harness, { items });

		await expect
			.poll(shown)
			.toEqual([
				"closed | 2",
				"Chiller repair",
				"Pump replacement",
				"draft | 2",
				"Elevator inspection",
				"Compressor overhaul",
				"open | 3 | continues on the next page",
				"Generator install",
			]);
		await page.getByRole("button", { name: "Go to next page" }).click();
		await expect
			.poll(shown)
			.toEqual([
				"open | 3 | continued from the previous page",
				"Boiler service",
				"Air handler check",
			]);
	});

	test("a group shows the sum of its amounts, on every page", async () => {
		visit("/items?group=status&sort=amount");
		render(Harness, { items });

		await expect.element(groupRow("closed")).toMatchTextContent(/Amount: €3\.00/);
		await expect.element(groupRow("open")).toMatchTextContent(/Amount: €62\.00/);
	});

	// One at a time and all at once in a test each: together they came close to a test's time under
	// the load of a full run.
	test("groups collapse and expand one at a time", async () => {
		visit("/items?group=status");
		render(Harness, { items });

		await expect.element(toggle("open")).toHaveAttribute("aria-expanded", "true");
		await toggle("open").click();
		await expect.element(toggle("open")).toHaveAttribute("aria-expanded", "false");
		await expect
			.poll(shown)
			.toEqual(["open | 3", "closed | 2", "Chiller repair", "Pump replacement"]);
		await toggle("open").click();
		await expect.poll(shown).toHaveLength(7);
	});

	test("or all at once", async () => {
		visit("/items?group=status");
		render(Harness, { items });

		await openViewMenu();
		await page.getByRole("menuitem", { name: "Collapse all groups" }).click();
		await expect.poll(shown).toEqual(["open | 3", "closed | 2"]);
		// Also those on other pages.
		await page.getByRole("button", { name: "Go to next page" }).click();
		await expect.poll(shown).toEqual(["draft | 2"]);

		await openViewMenu();
		await page.getByRole("menuitem", { name: "Expand all groups" }).click();
		await expect.poll(shown).toEqual(["draft | 2", "Compressor overhaul", "Elevator inspection"]);
	});

	test("a group's header row takes part in the keyboard navigation, Enter and Space toggle it", async () => {
		visit("/items?group=status");
		render(Harness, { items });
		await expect
			.element(page.getByRole("table"))
			.toHaveAccessibleDescription(
				"Arrow keys move between rows, Enter opens a row and Space selects it. On a group's row, Enter or Space shows or hides its rows.",
			);

		const header = document.querySelector<HTMLElement>('tbody tr[data-group="open"]')!;
		expect(header.tabIndex).toBe(0);
		header.focus();
		await userEvent.keyboard("{ArrowDown}");
		expect((document.activeElement as HTMLTableRowElement).cells[1].textContent).toBe(
			"Air handler check",
		);
		await userEvent.keyboard("{ArrowUp}{Enter}");
		await expect
			.poll(shown)
			.toEqual(["open | 3", "closed | 2", "Chiller repair", "Pump replacement"]);
		// Down from a collapsed group goes to the next group.
		await userEvent.keyboard("{ArrowDown}");
		expect((document.activeElement as HTMLElement).dataset.group).toBe("closed");
		await userEvent.keyboard("{ArrowUp} ");
		await expect.poll(shown).toHaveLength(7);
	});

	test("a group's checkbox selects its rows on the page", async () => {
		visit("/items?group=status");
		render(Harness, { items });

		await groupRow("closed").getByRole("checkbox", { name: "Select this group's rows" }).click();
		await expect.element(page.getByText("2 of 7 rows selected")).toBeInTheDocument();
		await page.getByRole("checkbox", { name: "Select row" }).nth(0).click();
		await expect
			.element(groupRow("open").getByRole("checkbox", { name: "Select this group's rows" }))
			.toHaveAttribute("aria-checked", "mixed");
	});

	test("an unknown or ungroupable column in the URL isn't grouped by", async () => {
		visit("/items?group=amount");
		render(Harness, { items });

		await expect.poll(headers).toContain("Status");
		expect(document.querySelector("tbody tr[data-group]")).toBeNull();
	});
});
