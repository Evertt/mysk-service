import { expect, test } from "vite-plus/test";

import { createAppColumnHelper, createAppTable } from "#lib/components/data-table/table.svelte.ts";
import { formatDate } from "#lib/i18n/format.ts";
import { day } from "#unit/temporal-support.ts";

interface Person {
	name: string;
	city: string;
	kind: "small_business" | "enterprise";
	note: string;
	since: Temporal.PlainDate | null;
}

const column = createAppColumnHelper<Person>();
const kinds = { small_business: "Small business", enterprise: "Enterprise" };

const columns = column.columns([
	column.select(),
	column.accessor("name", {}),
	column.accessor("city", {}),
	// Found by the name it's shown by, not as stored.
	column.accessor("kind", { meta: { clickFilter: (kind) => kinds[kind as keyof typeof kinds] } }),
	column.accessor("note", { enableGlobalFilter: false }),
	// Not text: searched when it says so.
	column.accessor("since", { enableGlobalFilter: true }),
	column.display({ id: "actions" }),
]);

const person = (name: string, fields: Partial<Person> = {}): Person => ({
	name,
	city: "Utrecht",
	kind: "small_business",
	note: "",
	since: null,
	...fields,
});

const rows = [
	person("Bakker", { city: "Tiel" }),
	person("Bakker & Zn", { city: "Utrecht", kind: "enterprise", note: "Tiel office" }),
	person("De Vries", { city: "Tiel", since: day("2026-03-07") }),
	person("Émile Smit", { city: "Zwolle" }),
];

/** The names the table shows for the search. */
const found = (search: string) =>
	createAppTable({ columns, data: rows, initialState: { globalFilter: search } })
		.getRowModel()
		.rows.map((row) => row.original.name);

test("a row matches when each word is in one of its columns, the words in different ones", () => {
	expect(found("Bakker Tiel")).toEqual(["Bakker"]);
	expect(found("tiel bakker")).toEqual(["Bakker"]);
	expect(found("Bakker")).toEqual(["Bakker", "Bakker & Zn"]);
});

test("every word is required", () => {
	expect(found("Bakker Zwolle")).toEqual([]);
	expect(found("Bakker nowhere")).toEqual([]);
});

test("a word is found inside a value, in any case, also beyond ASCII", () => {
	expect(found("AKK")).toEqual(["Bakker", "Bakker & Zn"]);
	expect(found("émile")).toEqual(["Émile Smit"]);
	expect(found("ÉMILE")).toEqual(["Émile Smit"]);
});

test("a word isn't found across two columns", () => {
	// "Bakker" then "Tiel": the name's end and the city's start.
	expect(found("rtiel")).toEqual([]);
});

test("an enum is found by its name as shown, a day as formatted", () => {
	expect(found("enterprise")).toEqual(["Bakker & Zn"]);
	expect(found("small business tiel")).toEqual(["Bakker", "De Vries"]);
	expect(found(formatDate(day("2026-03-07")))).toEqual(["De Vries"]);
	expect(found("2026-03-07")).toEqual([]);
});

test("columns with `enableGlobalFilter: false` aren't searched", () => {
	expect(found("office")).toEqual([]);
});

test("words past the tenth are ignored", () => {
	const ten = Array.from({ length: 10 }, () => "bakker").join(" ");
	expect(found(`${ten} zwolle`)).toEqual(["Bakker", "Bakker & Zn"]);
});

test("a search of white space finds every row", () => {
	expect(found("   ")).toHaveLength(rows.length);
});

test("the filters' counts are of the rows the search finds", () => {
	const table = createAppTable({ columns, data: rows, initialState: { globalFilter: "tiel" } });
	expect(Object.fromEntries(table.getColumn("kind")!.getFacetedUniqueValues())).toEqual({
		small_business: 2,
	});
});
