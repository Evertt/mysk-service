import { page, type Locator } from "vite-plus/test/browser";

import type { Item } from "./table.test-harness.svelte";

/** The work items the table specs show: seven, five to a page. */
export const items: Item[] = [
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

/** The items' names, sorted. */
export const byName = [...items].map((item) => item.name).sort((a, b) => a.localeCompare(b));

/** The names in the rows on the current page, in order. */
export const names = () =>
	[...document.querySelectorAll<HTMLTableRowElement>("tbody tr")].map(
		(row) => row.cells[1]?.textContent?.trim() ?? "",
	);

/** A column's header button, which sorts by it (its name goes on to say how it's sorted). */
export const columnHeader = (name: string) =>
	page
		.getByRole("row")
		.first()
		.getByRole("button", { name: new RegExp(`^${name}( sorted|$)`) });

/** Shift-clicks a column's header, which adds it to the sort or turns it around there. */
export const addToSort = (name: string) => columnHeader(name).click({ modifiers: ["Shift"] });

/** An option of the faceted filter, named by its label (its accessible name ends in its count). */
export const facet = (label: string) => page.getByRole("option", { name: new RegExp(`^${label}`) });

/** The faceted filter's button, whose name grows with the selection. */
export const statusFilter = () => page.getByRole("button", { name: /^Status/ });

/** Reads a locator's text with its whitespace collapsed, for `expect.poll`. */
export const textOf = (locator: Locator) => () =>
	locator.element().textContent?.replace(/\s+/g, " ").trim();
