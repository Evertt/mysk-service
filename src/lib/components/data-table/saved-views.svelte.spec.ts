import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { lastSearch, visit, visits } from "./fake-navigation.svelte.ts";
import { reset, sent, type TableView } from "./fake-views.svelte.ts";
import Harness, { type Item } from "./table.test-harness.svelte";

vi.mock("$app/state", async () => ({ page: (await import("./fake-navigation.svelte.ts")).page }));
vi.mock("$app/navigation", async () => ({
	goto: (await import("./fake-navigation.svelte.ts")).goto,
}));
vi.mock("./views.remote.js", () => import("./fake-views.svelte.ts"));

const items: Item[] = [
	{ id: 1, name: "Boiler service", status: "open", amount: 100, quantity: 1, dueOn: null },
	{ id: 2, name: "Chiller repair", status: "closed", amount: 200, quantity: 1, dueOn: null },
	{ id: 3, name: "Air handler check", status: "open", amount: 300, quantity: 1, dueOn: null },
	{ id: 4, name: "Elevator inspection", status: "draft", amount: 400, quantity: 1, dueOn: null },
];

const view = (
	fields: Partial<TableView> & Pick<TableView, "id" | "name" | "query">,
): TableView => ({
	shared: false,
	mine: true,
	owner: null,
	editable: true,
	...fields,
});

const open = view({ id: 1, name: "Open work", query: "?status=open" });
const priciest = view({ id: 2, name: "Priciest first", query: "?sort=-amount&size=10" });
const drafts = view({
	id: 3,
	name: "Drafts",
	query: "?status=draft",
	shared: true,
	mine: false,
	owner: "Anouk de Vries",
	editable: false,
});

/** The names in the rows, in order. */
const names = () =>
	[...document.querySelectorAll<HTMLTableRowElement>("tbody tr")].map(
		(row) => row.cells[1]?.textContent?.trim() ?? "",
	);

const menuButton = () => page.getByRole("button", { name: /^Saved views/ });
// A view by name (its accessible name goes on with who shared it).
const viewItem = (name: string) =>
	page.getByRole("menuitemradio", { name: new RegExp(`^${name}`) });
const action = (name: string) => page.getByRole("menuitem", { name });

beforeEach(() => {
	visit("/items");
	reset();
});

describe("the saved views menu", () => {
	test("without views, it offers to save the current one", async () => {
		render(Harness, { items });
		await menuButton().click();

		await expect.element(page.getByText("No saved views yet.")).toBeVisible();
		await expect.element(action("Save current view…")).toBeVisible();
	});

	test("lists the user's views and the shared ones, checking the one the table shows", async () => {
		reset([open, priciest, drafts]);
		visit("/items?status=open&page=2");
		render(Harness, { items });

		// The page doesn't count: the view shows the table from its first page.
		await expect.element(menuButton()).toHaveAccessibleName("Saved views: Open work");
		await menuButton().click();
		await expect.element(viewItem("Open work")).toHaveAttribute("aria-checked", "true");
		await expect.element(viewItem("Priciest first")).toHaveAttribute("aria-checked", "false");
		await expect.element(viewItem("Drafts").getByText("Shared by Anouk de Vries")).toBeVisible();
	});

	test("opening a view puts its parameters in the URL as a new history entry", async () => {
		reset([open, priciest]);
		visit("/items?status=open");
		render(Harness, { items });

		await menuButton().click();
		await viewItem("Priciest first").click();

		expect(lastSearch()).toBe("?sort=-amount&size=10");
		expect(visits.at(-1)?.replace).toBe(false);
		await expect
			.poll(names)
			.toEqual(["Elevator inspection", "Air handler check", "Chiller repair", "Boiler service"]);
		await expect.element(menuButton()).toHaveAccessibleName("Saved views: Priciest first");
	});

	test("saving sends the table's parameters without the page", async () => {
		visit("/items?status=open,draft&page=2");
		render(Harness, { items });

		await menuButton().click();
		await action("Save current view…").click();
		await page.getByLabelText("Name").fill("Open and drafts");
		await page.getByRole("button", { name: "Save", exact: true }).click();

		expect(sent.at(-1)).toEqual({
			name: "createView",
			data: { tableKey: "/items", query: "?status=open,draft", name: "Open and drafts" },
		});
	});

	test("only owners and admins can share a view as they save it", async () => {
		render(Harness, { items });
		await menuButton().click();
		await action("Save current view…").click();
		await expect.element(page.getByLabelText("Name")).toBeVisible();
		expect(page.getByLabelText("Share with the organization").elements()).toHaveLength(0);
	});

	test("a view the table moved away from can be updated with the change", async () => {
		reset([open]);
		render(Harness, { items });

		await menuButton().click();
		await viewItem("Open work").click();
		await menuButton().click();
		// Unchanged: nothing to update.
		await expect.element(action("Update with the current view")).toHaveAttribute("aria-disabled");
		await userEvent.keyboard("{Escape}");

		visit("/items?status=open,closed", { clear: false });
		await expect.element(menuButton()).toHaveAccessibleName("Saved views");
		await menuButton().click();
		await action("Update with the current view").click();

		expect(sent.at(-1)).toEqual({
			name: "updateView",
			data: { id: open.id, query: "?status=open,closed" },
		});
	});

	test("deleting a view asks first", async () => {
		reset([open]);
		visit("/items?status=open");
		render(Harness, { items });

		await menuButton().click();
		await action("Delete…").click();
		await expect
			.element(page.getByRole("alertdialog").getByText(/^Only you can see this view\./))
			.toBeVisible();
		expect(sent).toEqual([]);
		await page.getByRole("button", { name: "Delete", exact: true }).click();

		expect(sent.at(-1)).toEqual({ name: "deleteView", data: open.id });
	});

	test("a view shared by someone else can't be changed by a member", async () => {
		reset([drafts]);
		visit("/items?status=draft");
		render(Harness, { items });

		await menuButton().click();
		await expect.element(viewItem("Drafts")).toHaveAttribute("aria-checked", "true");
		expect(action("Rename…").elements()).toHaveLength(0);
		expect(action("Delete…").elements()).toHaveLength(0);
	});

	test("owners and admins can share their views and stop sharing shared ones", async () => {
		reset([open, { ...drafts, editable: true }], true);
		visit("/items?status=open");
		render(Harness, { items });

		await menuButton().click();
		await action("Share with the organization").click();
		expect(sent.at(-1)).toEqual({ name: "shareView", data: { id: open.id, shared: true } });

		await menuButton().click();
		await viewItem("Drafts").click();
		await menuButton().click();
		await action("Stop sharing").click();
		expect(sent.at(-1)).toEqual({ name: "shareView", data: { id: drafts.id, shared: false } });
	});
});
