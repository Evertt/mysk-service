import { describe, expect, test } from "vite-plus/test";

import { placeCards, stickiness } from "#routes/(app)/(dashboard)/masonry.ts";

describe("placeCards", () => {
	test("puts the first row side by side, in order, then each card under the shortest column", () => {
		expect(placeCards([400, 300, 200, 100, 100], 3, 24)).toEqual([
			{ column: 0, top: 0 },
			{ column: 1, top: 0 },
			{ column: 2, top: 0 },
			{ column: 2, top: 224 },
			{ column: 1, top: 324 },
		]);
	});

	test("takes the leftmost of equally short columns", () => {
		expect(placeCards([100, 100, 50, 50], 2, 0).map(({ column }) => column)).toEqual([0, 1, 0, 1]);
	});

	test("stacks everything in one column", () => {
		expect(placeCards([10, 20, 30], 1, 5)).toEqual([
			{ column: 0, top: 0 },
			{ column: 0, top: 15 },
			{ column: 0, top: 40 },
		]);
	});

	test("keeps a card in its column while that's at most `stickiness` taller than the shortest", () => {
		const first = placeCards([300, 300, 100], 2, 0);
		expect(first.map(({ column }) => column)).toEqual([0, 1, 0]);
		// The second card grows a little: the third would now fit better under the first, but stays.
		const grown = placeCards([300, 300 - stickiness, 100], 2, 0, [0, 1, 0]);
		expect(grown.map(({ column }) => column)).toEqual([0, 1, 0]);
		// …until the difference is more than that.
		const shrunk = placeCards([300, 300 - stickiness - 1, 100], 2, 0, [0, 1, 0]);
		expect(shrunk.map(({ column }) => column)).toEqual([0, 1, 1]);
	});

	test("ignores a previous column that no longer exists", () => {
		expect(placeCards([100, 100], 2, 0, [2, 2]).map(({ column }) => column)).toEqual([0, 1]);
	});
});
