import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";

import {
	countFields,
	materialFields,
	newMaterialFields,
	receiveFields,
} from "#modules/materials/form/material-schema.ts";

/** The parsed value, or the messages of all issues. */
const parser =
	(fields: v.ObjectEntries) =>
	(input: Record<string, unknown>): { value: unknown } | { issues: string[] } => {
		const result = v.safeParse(v.object(fields), input);
		return result.success
			? { value: result.output }
			: { issues: result.issues.map((issue) => issue.message) };
	};

describe("a new material", () => {
	const parse = parser(newMaterialFields);
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

	test("the opening stock has at most two decimals, and isn't below zero", () => {
		expect(parse({ ...form, stock: -1 })).toEqual({ issues: ["Can't be negative"] });
		expect(parse({ ...form, stock: 2.125 })).toEqual({ issues: ["At most two decimals"] });
		expect(parse({ ...form, stock: 2.55 })).not.toHaveProperty("issues");
	});

	test("the unit is one of the material units", () => {
		expect(parse({ ...form, unit: "box" })).toEqual({ issues: ["Choose a unit"] });
	});
});

test("editing a material doesn't take its stock", () => {
	const parse = parser(materialFields);
	expect(parse({ name: "Valve", unit: "pcs", unitPrice: 12, stock: 99 })).toEqual({
		value: { name: "Valve", unit: "pcs", unitPrice: 1200 },
	});
});

describe("receiving stock", () => {
	const parse = parser(receiveFields);

	test("takes a quantity and an optional note", () => {
		expect(parse({ quantity: 12.5, note: " Delivery 4411 " })).toEqual({
			value: { quantity: 12.5, note: "Delivery 4411" },
		});
		expect(parse({ quantity: 3, note: "  " })).toEqual({ value: { quantity: 3, note: null } });
		expect(parse({ quantity: 3 })).toEqual({ value: { quantity: 3, note: null } });
	});

	test("needs more than nothing, to two decimals", () => {
		expect(parse({ quantity: undefined })).toEqual({ issues: ["Enter the quantity"] });
		expect(parse({ quantity: 0 })).toEqual({ issues: ["More than 0"] });
		expect(parse({ quantity: 1.005 })).toEqual({ issues: ["At most two decimals"] });
	});
});

describe("counting stock", () => {
	const parse = parser(countFields);

	test("takes the counted quantity, which may be nothing, and a reason", () => {
		expect(parse({ counted: 0, note: " Damaged in storage " })).toEqual({
			value: { counted: 0, note: "Damaged in storage" },
		});
	});

	test("needs a reason and a count that isn't negative", () => {
		expect(parse({ counted: -1, note: "" })).toEqual({
			issues: ["Can't be negative", "Say why the stock differs"],
		});
		expect(parse({ counted: undefined, note: "x" })).toEqual({
			issues: ["Enter the counted stock"],
		});
	});
});
