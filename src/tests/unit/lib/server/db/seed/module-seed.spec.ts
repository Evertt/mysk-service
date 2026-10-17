import { expect, test } from "vite-plus/test";

import { runOrder } from "#lib/server/db/seed/module-seed.ts";

const seed = (id: string, after?: string[]) => ({ id, seed: { after } });
const ids = (seeds: { id: string }[]) => seeds.map((each) => each.id);

test("the seeds run in the registry's order, each after the ones it says it comes after", () => {
	expect(ids(runOrder([seed("a"), seed("b"), seed("c")]))).toEqual(["a", "b", "c"]);
	// Condition reads the materials' rows: it runs right after them.
	expect(
		ids(
			runOrder([
				seed("checklists"),
				seed("condition", ["materials"]),
				seed("maintenance"),
				seed("materials"),
				seed("parts-shop"),
			]),
		),
	).toEqual(["checklists", "maintenance", "materials", "condition", "parts-shop"]);
	// One that's already after them, or after a seed that isn't there, stays where it is.
	expect(ids(runOrder([seed("a"), seed("b", ["a"]), seed("c", ["x"])]))).toEqual(["a", "b", "c"]);
	// After the last of several.
	expect(ids(runOrder([seed("a", ["b", "c"]), seed("b"), seed("c"), seed("d")]))).toEqual([
		"b",
		"c",
		"a",
		"d",
	]);
});
