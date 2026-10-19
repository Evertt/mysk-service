/**
 * The order of the options of a filter on related records: most rows first, ties by name, those
 * without rows last (`byCount`, which `recordFacets()` sorts by, as `facetOptions()` does in SQL),
 * and a `RecordFilter`'s groups (`recordOptionsInOrder`): none, the ticked ones the search didn't
 * find, then what it found.
 */
import { describe, expect, test } from "vite-plus/test";

import { byCount, recordOptionsInOrder } from "#lib/components/data-table/record-facets.ts";
import { noneToken } from "#lib/components/data-table/url-state.ts";

describe("byCount", () => {
	test("puts the most rows first, equal counts by name, and those without rows last", () => {
		const options = [
			{ label: "Zeeman", count: 0 },
			{ label: "Bakker", count: 3 },
			{ label: "Aarts", count: 3 },
			{ label: "Visser", count: 7 },
			{ label: "Admiraal", count: 0 },
			{ label: "Mulder", count: 1 },
		];
		expect(options.toSorted(byCount).map((option) => option.label)).toEqual([
			"Visser",
			"Aarts",
			"Bakker",
			"Mulder",
			"Admiraal",
			"Zeeman",
		]);
	});

	test("takes an option without a count for 0", () => {
		expect([{ label: "B" }, { label: "A", count: 1 }].toSorted(byCount)).toEqual([
			{ label: "A", count: 1 },
			{ label: "B" },
		]);
	});
});

describe("recordOptionsInOrder", () => {
	const found = {
		options: [
			{ value: "C-3", label: "Visser", count: 7 },
			{ value: "C-1", label: "Aarts", count: 3 },
			{ value: "C-9", label: "Zeeman", count: 0 },
		],
		selected: [{ value: "C-5", label: "Mulder", count: 2 }],
	};

	test("shows none, then the ticked ones the search didn't find, then what it found in its order", () => {
		const none = { value: noneToken, label: "Unassigned", count: 4 };
		const shown = recordOptionsInOrder({
			none,
			selected: ["C-5", "C-1"],
			found,
			known: () => undefined,
		});
		expect(shown).toEqual([none, found.selected[0], ...found.options]);
	});

	test("names a ticked one the answer doesn't by what was seen before, without its old count", () => {
		const shown = recordOptionsInOrder({
			selected: ["C-7", "C-8"],
			found,
			known: (value) =>
				value === "C-7" ? { value, label: "Jansen", detail: "Dock 1", count: 12 } : undefined,
		});
		expect(shown.slice(0, 2)).toEqual([
			{ value: "C-7", label: "Jansen", detail: "Dock 1" },
			{ value: "C-8", label: "C-8" },
		]);
	});
});
