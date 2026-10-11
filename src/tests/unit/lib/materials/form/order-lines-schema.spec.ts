import * as v from "valibot";
import { expect, test } from "vite-plus/test";

import { materialsPart } from "#lib/materials/form/order-lines-schema.ts";

/** The parsed value, or the messages of all issues. */
const parse = (input: Record<string, unknown>) => {
	const result = v.safeParse(materialsPart, input);
	return result.success
		? { value: result.output }
		: { issues: result.issues.map((issue) => issue.message) };
};

test("lines become numbers", () => {
	expect(parse({ lines: [{ materialId: "9", quantity: 2 }] })).toEqual({
		value: { lines: [{ materialId: 9, quantity: 2 }] },
	});
});

test("a part without lines has none", () => {
	expect(parse({})).toEqual({ value: { lines: [] } });
});

test("each line needs a material and a quantity above zero, to at most two decimals", () => {
	const lines = [
		{ materialId: "", quantity: 1 },
		{ materialId: "3", quantity: 0 },
		{ materialId: "3", quantity: 1.005 },
	];
	expect(parse({ lines })).toEqual({
		issues: ["Choose a material", "More than 0", "At most two decimals"],
	});
	expect(parse({ lines: [{ materialId: "3", quantity: 2.5 }] })).not.toHaveProperty("issues");
});

test("the issues point at the line and field they're about", () => {
	const result = v.safeParse(materialsPart, {
		lines: [
			{ materialId: "3", quantity: 1 },
			{ materialId: "3", quantity: 0 },
		],
	});
	expect(result.success).toBe(false);
	expect(result.issues?.map((issue) => v.getDotPath(issue))).toEqual(["lines.1.quantity"]);
});
