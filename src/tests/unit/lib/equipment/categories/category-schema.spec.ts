import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";

import { categorySchema, newCategorySchema } from "#lib/equipment/categories/category-schema.ts";
import { moved } from "#lib/ordering.ts";
import { moveSchema } from "#lib/schema.ts";

/** The parsed value, or the messages of all issues. */
const parse = (schema: v.GenericSchema, input: unknown) => {
	const result = v.safeParse(schema, input);
	return result.success
		? { value: result.output }
		: { issues: result.issues.map((issue) => issue.message) };
};

describe("the category form", () => {
	test("a trimmed name, and a specialty or none", () => {
		expect(
			parse(newCategorySchema, { name: "  Sectionaaldeur ", specialty: "mechanical" }),
		).toEqual({ value: { name: "Sectionaaldeur", specialty: "mechanical" } });
		expect(parse(newCategorySchema, { name: "Overig", specialty: "" })).toEqual({
			value: { name: "Overig", specialty: null },
		});
	});

	test("the name is required, and at most 60 characters", () => {
		expect(parse(newCategorySchema, { name: "  ", specialty: "" })).toEqual({
			issues: ["Name the category"],
		});
		expect(parse(newCategorySchema, { name: "A".repeat(60), specialty: "" })).toHaveProperty(
			"value",
		);
		expect(parse(newCategorySchema, { name: "A".repeat(61), specialty: "" })).toEqual({
			issues: ["Keep it to 60 characters"],
		});
	});

	test("the specialty is one of the engineers'", () => {
		expect(parse(newCategorySchema, { name: "Lift", specialty: "magic" })).toEqual({
			issues: ["Choose one"],
		});
	});

	test("editing one names it by id", () => {
		expect(parse(categorySchema, { id: "7", name: "Lift", specialty: "controls" })).toEqual({
			value: { id: 7, name: "Lift", specialty: "controls" },
		});
		expect(parse(moveSchema, { id: "7", direction: "sideways" })).toHaveProperty("issues");
	});
});

describe("moved", () => {
	const ids = [1, 2, 3];

	test("swaps a category with its neighbour", () => {
		expect(moved(ids, 1, "up")).toEqual([2, 1, 3]);
		expect(moved(ids, 1, "down")).toEqual([1, 3, 2]);
	});

	test("leaves the order at its ends, and for one that isn't in it", () => {
		expect(moved(ids, 0, "up")).toEqual(ids);
		expect(moved(ids, 2, "down")).toEqual(ids);
		expect(moved(ids, -1, "up")).toEqual(ids);
		expect(moved(ids, 3, "down")).toEqual(ids);
	});
});
