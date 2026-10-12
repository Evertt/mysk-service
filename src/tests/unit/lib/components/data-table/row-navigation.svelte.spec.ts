import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { visit } from "./fake-navigation.svelte.ts";
import Harness, { type Item } from "./table.test-harness.svelte";

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

/** The links followed (and stopped, so the test page stays put), oldest first. */
const opened: string[] = [];

function followLink(event: MouseEvent) {
	const link = (event.target as Element).closest("a");
	if (!link) return;
	event.preventDefault();
	opened.push(link.getAttribute("href") ?? "");
}

beforeEach(() => {
	visit("/items");
	opened.length = 0;
	window.addEventListener("click", followLink, { capture: true });
});

afterEach(() => window.removeEventListener("click", followLink, { capture: true }));

// Seven items, named in their sort order, on pages of five.
const items: Item[] = ["A", "B", "C", "D", "E", "F", "G"].map((letter, index) => ({
	id: index + 1,
	name: `${letter} item`,
	status: "open",
	amount: 100,
	quantity: 1,
	dueOn: null,
}));

const bodyRows = () => [...document.querySelectorAll<HTMLTableRowElement>("tbody tr")];

/** The name in the focused row, if a row has focus. */
const focusedRow = () => {
	const focused = document.activeElement;
	return focused instanceof HTMLTableRowElement ? focused.cells[1]?.textContent?.trim() : undefined;
};

/** Renders the table and focuses its first row, as tabbing to it would. */
async function renderFocused(props: { links?: boolean } = {}) {
	render(Harness, { items, ...props });
	await expect.element(page.getByRole("table")).toBeVisible();
	bodyRows()[0]!.focus();
	expect(focusedRow()).toBe("A item");
}

describe("keyboard navigation", () => {
	test("one row is in the tab order: the first, then the last one focused", async () => {
		render(Harness, { items });
		await expect.element(page.getByRole("table")).toBeVisible();
		expect(bodyRows().map((row) => row.tabIndex)).toEqual([0, -1, -1, -1, -1]);

		await page.getByRole("checkbox", { name: "Select row" }).nth(2).click();
		expect(bodyRows().map((row) => row.tabIndex)).toEqual([-1, -1, 0, -1, -1]);
	});

	test("the table describes its keys", async () => {
		render(Harness, { items });
		await expect
			.element(page.getByRole("table"))
			.toHaveAccessibleDescription(
				"Arrow keys move between rows, Enter opens a row and Space selects it.",
			);
	});

	test("the arrow keys move the focus down and up, Home and End to the ends", async () => {
		await renderFocused();
		await userEvent.keyboard("{ArrowDown}{ArrowDown}");
		expect(focusedRow()).toBe("C item");
		await userEvent.keyboard("{ArrowUp}");
		expect(focusedRow()).toBe("B item");
		await userEvent.keyboard("{End}");
		expect(focusedRow()).toBe("E item");
		await userEvent.keyboard("{ArrowDown}");
		expect(focusedRow()).toBe("E item");
		await userEvent.keyboard("{Home}");
		expect(focusedRow()).toBe("A item");
		await userEvent.keyboard("{ArrowUp}");
		expect(focusedRow()).toBe("A item");
	});

	test("the focused row shows a focus ring", async () => {
		await renderFocused();
		await userEvent.keyboard("{ArrowDown}");
		const [first, second] = bodyRows();
		expect(getComputedStyle(second!, "::after").display).toBe("block");
		expect(getComputedStyle(first!, "::after").display).toBe("none");
	});

	test("Enter follows the row's link", async () => {
		await renderFocused({ links: true });
		await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
		expect(opened).toEqual(["/items/3"]);
	});

	test("Space selects and deselects the row", async () => {
		await renderFocused();
		await userEvent.keyboard("{ArrowDown}{ }");
		const second = bodyRows()[1]!;
		expect(second.dataset.state).toBe("selected");
		await expect.element(page.getByRole("checkbox", { name: "Select row" }).nth(1)).toBeChecked();
		await expect.element(page.getByText("1 of 7 rows selected")).toBeVisible();
		expect(focusedRow()).toBe("B item");

		await userEvent.keyboard("{ }");
		expect(second.dataset.state).toBeUndefined();
	});

	test("PageDown and PageUp go to the next and previous page, at the same row", async () => {
		await renderFocused();
		await userEvent.keyboard("{ArrowDown}{PageDown}");
		await expect.element(page.getByText("Page 2 of 2")).toBeVisible();
		await expect.poll(focusedRow).toBe("G item");

		await userEvent.keyboard("{PageDown}");
		expect(focusedRow()).toBe("G item");

		await userEvent.keyboard("{PageUp}");
		await expect.element(page.getByText("Page 1 of 2")).toBeVisible();
		await expect.poll(focusedRow).toBe("B item");
		await userEvent.keyboard("{PageUp}");
		expect(focusedRow()).toBe("A item");
	});

	test("keys in a cell's controls keep their own meaning", async () => {
		render(Harness, { items });
		const checkbox = page.getByRole("checkbox", { name: "Select row" }).first();
		await checkbox.click();
		await userEvent.keyboard("{ArrowDown}");
		expect(document.activeElement).toBe(checkbox.element());
		await userEvent.keyboard("{ }");
		await expect.element(checkbox).not.toBeChecked();
	});

	test("Tab goes from the row to the controls in it", async () => {
		await renderFocused();
		await userEvent.keyboard("{ArrowDown}");
		await userEvent.tab();
		expect(document.activeElement).toBe(
			page.getByRole("checkbox", { name: "Select row" }).nth(1).element(),
		);
	});

	test("a row moved to scrolls into view, clear of the sticky header", async () => {
		await renderFocused();
		const area = document.querySelector<HTMLElement>("[data-slot=table-container]")!;
		const header = document.querySelector("thead")!;
		area.style.height = `${header.offsetHeight + 2 * bodyRows()[0]!.offsetHeight}px`;

		await userEvent.keyboard("{End}");
		const last = bodyRows().at(-1)!.getBoundingClientRect();
		expect(area.scrollTop).toBeGreaterThan(0);
		expect(last.bottom).toBeLessThanOrEqual(area.getBoundingClientRect().bottom + 1);

		await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
		const row = bodyRows()[1]!.getBoundingClientRect();
		expect(row.top).toBeGreaterThanOrEqual(header.getBoundingClientRect().bottom - 1);
	});
});
