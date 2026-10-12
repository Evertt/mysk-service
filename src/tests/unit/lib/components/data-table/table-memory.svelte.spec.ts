import { beforeEach, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { visit } from "./fake-navigation.svelte.ts";
import { remembered } from "./fake-table-memory.ts";
import { reset, type TableView } from "./fake-views.svelte.ts";
import Harness, { type Item } from "./table.test-harness.svelte";

vi.mock("$app/state", async () => ({ page: (await import("./fake-navigation.svelte.ts")).page }));
vi.mock("$app/navigation", async () => ({
	goto: (await import("./fake-navigation.svelte.ts")).goto,
}));
vi.mock("#lib/components/data-table/views.remote.ts", () => import("./fake-views.svelte.ts"));
vi.mock(
	"#lib/components/data-table/table-memory.remote.ts",
	() => import("./fake-table-memory.ts"),
);

const items: Item[] = [
	{ id: 1, name: "Boiler service", status: "open", amount: 100, quantity: 1, dueOn: null },
	{ id: 2, name: "Chiller repair", status: "closed", amount: 200, quantity: 1, dueOn: null },
];

const open: TableView = {
	id: 1,
	name: "Open work",
	query: "?status=open",
	columns: { status: true, amount: true, quantity: true },
	shared: false,
	mine: true,
	owner: null,
	editable: true,
};

const menuButton = () => page.getByRole("button", { name: /^Saved views/ });
/** The column headers' names, as shown. */
const headers = () =>
	[...document.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");

beforeEach(() => {
	reset([open]);
	remembered.length = 0;
});

test("the columns come back as they were left", async () => {
	visit("/items", { memory: { query: "", viewId: null, columns: { amount: false } } });
	render(Harness, { items });

	await expect.poll(headers).toContain("Status");
	await expect.poll(headers).not.toContain("Amount");
});

test("the view left open comes back, with its unsaved changes", async () => {
	// The load has brought the parameters back (see `loadTableMemory`).
	visit("/items?status=open,closed", {
		memory: { query: "?status=open,closed", viewId: open.id, columns: { quantity: false } },
	});
	render(Harness, { items });

	await expect
		.element(menuButton())
		.toHaveAccessibleName("Saved views: Open work, with unsaved changes");
	await expect.poll(headers).not.toContain("Quantity");
});

test("a link with other parameters keeps the columns, but not the view", async () => {
	visit("/items?status=closed", {
		memory: { query: "?status=open,closed", viewId: open.id, columns: { quantity: false } },
	});
	render(Harness, { items });

	await expect.element(menuButton()).toHaveAccessibleName("Saved views");
	await expect.poll(headers).not.toContain("Quantity");
});

test("the table remembers its changes once they settle, and forgets them at its defaults", async () => {
	visit("/items", { memory: null });
	render(Harness, { items });
	await expect.poll(headers).toContain("Amount");
	expect(remembered).toEqual([]);

	await page.getByRole("button", { name: "View", exact: true }).click();
	await page.getByRole("menuitemcheckbox", { name: "Amount" }).click();
	await userEvent.keyboard("{Escape}");
	await menuButton().click();
	await page.getByRole("menuitemradio", { name: /^Open work/ }).click();

	await expect
		.poll(() => remembered.at(-1), { timeout: 2000 })
		.toEqual({
			owner: "org:user",
			tableKey: "/items",
			query: "?status=open",
			viewId: open.id,
			// The view's columns.
			columns: null,
		});

	await menuButton().click();
	await page.getByRole("menuitem", { name: "No view" }).click();
	await expect
		.poll(() => remembered.at(-1), { timeout: 2000 })
		.toEqual({ owner: "org:user", tableKey: "/items", query: "", viewId: null, columns: null });
});

test("a table whose page doesn't bring it back remembers nothing", async () => {
	visit("/items");
	render(Harness, { items });
	await page.getByRole("button", { name: "View", exact: true }).click();
	await page.getByRole("menuitemcheckbox", { name: "Amount" }).click();
	await userEvent.keyboard("{Escape}");
	await new Promise((resolve) => setTimeout(resolve, 700));
	expect(remembered).toEqual([]);
});
