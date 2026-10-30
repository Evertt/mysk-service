/**
 * The wiki's search (`#wiki/search.ts`): its index, a page's title and each of its `##` headings,
 * and `searchPages()`, which finds the entries holding every word of the query, titles first.
 */
import { describe, expect, test } from "vite-plus/test";

import { entryHref, searchIndex, searchPages, type SearchEntry } from "#wiki/search.ts";

/** A made-up index, in page order. */
const index: SearchEntry[] = [
	{ slug: "internals/tenancy", title: "Tenancy" },
	{ slug: "internals/tenancy", title: "Tenancy", heading: "Every tenant query is scoped" },
	{ slug: "internals/tenancy", title: "Tenancy", heading: "Tenant ids from the client" },
	{ slug: "across/lists", title: "Lists" },
	{ slug: "across/lists", title: "Lists", heading: "The scope of a tenant's list" },
	{ slug: "internals/scope", title: "Tenant scope" },
];

const text = (entry: SearchEntry) => `${entry.title} ${entry.heading ?? ""}`.toLowerCase();

describe("searchPages", () => {
	test('"lifecycle" finds the order lifecycle first', () => {
		expect(searchPages("lifecycle", searchIndex)[0]).toEqual({
			slug: "orders/lifecycle",
			title: "Order lifecycle",
		});
	});

	test('"tenant scope" matches only entries holding both words', () => {
		const found = searchPages("tenant scope", index);
		expect(found.length).toBeGreaterThan(0);
		for (const entry of found) {
			expect(text(entry)).toContain("tenant");
			expect(text(entry)).toContain("scope");
		}
		expect(found).toEqual([
			{ slug: "internals/scope", title: "Tenant scope" },
			{ slug: "internals/tenancy", title: "Tenancy", heading: "Every tenant query is scoped" },
			{ slug: "across/lists", title: "Lists", heading: "The scope of a tenant's list" },
		]);
	});

	test('"" finds nothing, and neither does only whitespace', () => {
		expect(searchPages("", index)).toEqual([]);
		expect(searchPages("   ", index)).toEqual([]);
	});

	test("ignores case, and finds a word as it is being typed", () => {
		expect(searchPages("TENANCY", index)[0]).toEqual({
			slug: "internals/tenancy",
			title: "Tenancy",
		});
		expect(searchPages("lis", index)[0]).toEqual({ slug: "across/lists", title: "Lists" });
	});

	test("ranks titles above headings", () => {
		expect(searchPages("tenant", index).map((entry) => entry.heading)).toEqual([
			undefined,
			"Every tenant query is scoped",
			"Tenant ids from the client",
			"The scope of a tenant's list",
		]);
	});

	test("a heading whose page's title already matches is left to the title", () => {
		expect(searchPages("tenancy", index)).toEqual([
			{ slug: "internals/tenancy", title: "Tenancy" },
		]);
	});

	test("a quote matches whether it's curled or straight, in the index or the query", () => {
		const quoted: SearchEntry[] = [
			{ slug: "a", title: "A", heading: "Until it’s decided" },
			{ slug: "b", title: "B", heading: 'The "done" status' },
			{ slug: "c", title: "C", heading: "What it isn't" },
		];
		expect(searchPages("it's", quoted).map((entry) => entry.slug)).toEqual(["a"]);
		expect(searchPages("“done”", quoted).map((entry) => entry.slug)).toEqual(["b"]);
		expect(searchPages("isn’t", quoted).map((entry) => entry.slug)).toEqual(["c"]);
	});
});

describe("entryHref", () => {
	test("leads to the page, or to the heading on it", () => {
		expect(entryHref({ slug: "orders/lifecycle", title: "Order lifecycle" })).toBe(
			"/wiki/orders/lifecycle",
		);
		expect(
			entryHref({
				slug: "orders/lifecycle",
				title: "Order lifecycle",
				heading: "Try the moves",
				id: "try-the-moves",
			}),
		).toBe("/wiki/orders/lifecycle#try-the-moves");
	});
});

describe("the index of the real pages", () => {
	test("has each page's title, and its ## headings", () => {
		expect(searchIndex).toContainEqual({ slug: "orders/lifecycle", title: "Order lifecycle" });
		expect(searchIndex).toContainEqual({
			slug: "orders/lifecycle",
			title: "Order lifecycle",
			heading: "Try the moves",
			id: "try-the-moves",
		});
	});

	test("finds a curled heading as the visitor types it", () => {
		expect(searchPages("isn't work", searchIndex)).toContainEqual({
			slug: "orders/awaiting-acceptance",
			title: "Orders awaiting acceptance",
			heading: "Until it’s decided, it isn’t work",
			id: "until-its-decided-it-isnt-work",
		});
	});

	test("has a heading as it reads, without its Markdown", () => {
		expect(searchIndex.filter((entry) => /[`*_[\]]/.test(entry.heading ?? ""))).toEqual([]);
	});
});
