import { expect, test } from "vite-plus/test";

import { listLimits } from "#lib/components/data-table/list-definition.ts";
import { searchWords } from "#lib/components/data-table/search-words.ts";

test("splits the search on white space, without empty words", () => {
	expect(searchWords(" Bakker  Tiel ")).toEqual(["Bakker", "Tiel"]);
	expect(searchWords('pump\t3/4"\nDaikin')).toEqual(["pump", '3/4"', "Daikin"]);
	expect(searchWords("CUS-042")).toEqual(["CUS-042"]);
});

test("an empty search has no words", () => {
	expect(searchWords("")).toEqual([]);
	expect(searchWords(" \t ")).toEqual([]);
});

test("keeps the first ten words, ignoring the rest", () => {
	const words = Array.from({ length: 12 }, (_, index) => `w${index + 1}`);
	expect(listLimits.words).toBe(10);
	expect(searchWords(words.join(" "))).toEqual(words.slice(0, 10));
});
