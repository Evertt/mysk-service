import * as v from "valibot";
import { expect, test } from "vite-plus/test";

import { materialFields } from "./material-schema.ts";

/** The parsed value, or the messages of all issues. */
const parse = (input: Record<string, unknown>) => {
	const result = v.safeParse(v.object(materialFields), input);
	return result.success
		? { value: result.output }
		: { issues: result.issues.map((issue) => issue.message) };
};

const form = { name: " Copper pipe 15 mm ", unit: "m", unitPrice: 4.35, stock: 120 };

test("a filled-in form becomes a material, with the price in cents", () => {
	expect(parse(form)).toEqual({
		value: { name: "Copper pipe 15 mm", unit: "m", unitPrice: 435, stock: 120 },
	});
});

test("a material may be free and out of stock", () => {
	expect(parse({ ...form, unitPrice: 0, stock: 0 })).toHaveProperty("value.stock", 0);
});

test("an empty form says what's missing", () => {
	expect(parse({ name: "", unit: "", unitPrice: undefined, stock: undefined })).toEqual({
		issues: ["Name the material", "Choose a unit", "Enter a price", "Enter the stock"],
	});
});

test("the stock has at most two decimals, and isn't below zero", () => {
	expect(parse({ ...form, stock: -1 })).toEqual({ issues: ["Can't be negative"] });
	expect(parse({ ...form, stock: 2.125 })).toEqual({ issues: ["At most two decimals"] });
	expect(parse({ ...form, stock: 2.55 })).not.toHaveProperty("issues");
});

test("the unit is one of the material units", () => {
	expect(parse({ ...form, unit: "box" })).toEqual({ issues: ["Choose a unit"] });
});
