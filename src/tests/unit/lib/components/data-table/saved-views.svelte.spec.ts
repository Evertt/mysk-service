import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { resetHistoryDialogs } from "#unit/lib/components/fake-history-dialog.svelte.ts";

import { lastSearch, visit, visits } from "./fake-navigation.svelte.ts";
import { reset, sent, type TableView } from "./fake-views.svelte.ts";
import Harness, { type Item } from "./table.test-harness.svelte";

vi.mock("$app/state", () => import("./fake-navigation.svelte.ts"));
vi.mock("$app/navigation", async () => ({
	goto: (await import("./fake-navigation.svelte.ts")).goto,
}));
vi.mock("#lib/components/data-table/views.remote.ts", () => import("./fake-views.svelte.ts"));
// The views' dialogs open with history entries of their own, through SvelteKit's router.
vi.mock(
	"#lib/components/history-dialog.svelte.ts",
	() => import("#unit/lib/components/fake-history-dialog.svelte.ts"),
);
vi.mock(
	"#lib/components/data-table/table-memory.remote.ts",
	() => import("./fake-table-memory.ts"),
);

const items: Item[] = [
	{ id: 1, name: "Boiler service", status: "open", amount: 100, quantity: 1, dueOn: null },
	{ id: 2, name: "Chiller repair", status: "closed", amount: 200, quantity: 1, dueOn: null },
	{ id: 3, name: "Air handler check", status: "open", amount: 300, quantity: 1, dueOn: null },
	{ id: 4, name: "Elevator inspection", status: "draft", amount: 400, quantity: 1, dueOn: null },
];

const view = (
	fields: Partial<TableView> & Pick<TableView, "id" | "name" | "query">,
): TableView => ({
	columns: null,
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
/** The column headers' names, as shown. */
const headers = () =>
	[...document.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");

beforeEach(() => {
	visit("/items");
	reset();
	resetHistoryDialogs();
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
		visit("/items?status=open&row=2");
		render(Harness, { items });

		// Where it was scrolled to doesn't count.
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

		// Saved when the table had pages: their size is no longer the table's.
		expect(lastSearch()).toBe("?sort=-amount");
		expect(visits.at(-1)?.replace).toBe(false);
		await expect
			.poll(names)
			.toEqual(["Elevator inspection", "Air handler check", "Chiller repair", "Boiler service"]);
		await expect.element(menuButton()).toHaveAccessibleName("Saved views: Priciest first");
	});

	test("saving sends the table's parameters without the position, and its columns", async () => {
		visit("/items?status=open,draft&row=2");
		render(Harness, { items });

		await menuButton().click();
		await action("Save current view…").click();
		await page.getByLabelText("Name").fill("Open and drafts");
		await page.getByRole("button", { name: "Save", exact: true }).click();

		expect(sent.at(-1)).toEqual({
			name: "createView",
			data: {
				tableKey: "/items",
				query: "?status=open,draft",
				columns: JSON.stringify({ status: true, amount: true, quantity: true }),
				name: "Open and drafts",
			},
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
		await expect
			.element(menuButton())
			.toHaveAccessibleName("Saved views: Open work, with unsaved changes");
		await menuButton().click();
		await action("Update with the current view").click();

		expect(sent.at(-1)).toEqual({
			name: "updateView",
			data: {
				id: open.id,
				query: "?status=open,closed",
				columns: { status: true, amount: true, quantity: true },
			},
		});
	});

	test("a view shows the columns it saved, and the defaults of those it doesn't know", async () => {
		reset([
			view({ id: 4, name: "Lean", query: "", columns: { amount: false, gone: false } }),
			open,
		]);
		render(Harness, { items });
		await expect.poll(headers).toContain("Amount");

		await menuButton().click();
		await viewItem("Lean").click();
		await expect.poll(headers).not.toContain("Amount");
		await expect.poll(headers).toContain("Status");
		await expect.poll(headers).toContain("Quantity");
		await expect.element(menuButton()).toHaveAccessibleName("Saved views: Lean");

		// A view saved before views had columns leaves them as they are.
		await menuButton().click();
		await viewItem("Open work").click();
		await expect.element(menuButton()).toHaveAccessibleName("Saved views: Open work");
		await expect.poll(headers).not.toContain("Amount");
	});

	test("showing or hiding a column is a change to the open view", async () => {
		reset([view({ ...open, columns: { status: true, amount: true, quantity: true } })]);
		render(Harness, { items });
		await menuButton().click();
		await viewItem("Open work").click();
		await expect.element(menuButton()).toHaveAccessibleName("Saved views: Open work");

		await page.getByRole("button", { name: "View", exact: true }).click();
		await page.getByRole("menuitemcheckbox", { name: "Quantity" }).click();
		await userEvent.keyboard("{Escape}");

		await expect
			.element(menuButton())
			.toHaveAccessibleName("Saved views: Open work, with unsaved changes");
	});

	test("No view goes back to the table's defaults, columns too", async () => {
		reset([view({ ...open, columns: { status: false, amount: true, quantity: true } })]);
		render(Harness, { items });
		await menuButton().click();
		expect(action("No view").elements()).toHaveLength(0);
		await viewItem("Open work").click();
		await expect.poll(headers).not.toContain("Status");

		await menuButton().click();
		await action("No view").click();

		await expect.element(menuButton()).toHaveAccessibleName("Saved views");
		await expect.poll(headers).toContain("Status");
		await expect.poll(lastSearch).toBe("");
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
