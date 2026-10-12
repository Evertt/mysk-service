import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";

import { contractFields } from "#modules/contracts/form/contract-schema.ts";
import { day } from "#unit/temporal-support.ts";

/** The parsed value, or the first issue's message. */
const parse = (schema: v.GenericSchema, input: unknown) => {
	const result = v.safeParse(schema, input);
	return result.success ? { value: result.output } : { issue: result.issues[0].message };
};

const form = {
	customerId: "12",
	level: "premium",
	startsOn: "2026-01-01",
	endsOn: "2026-12-31",
	monthlyFee: 249.5,
	responseHours: 4,
	notes: "  Keys at the front desk  ",
	equipmentIds: ["3", "8"],
};

test("a filled-in form becomes a contract", () => {
	expect(parse(v.object(contractFields), form)).toEqual({
		value: {
			customerId: 12,
			level: "premium",
			startsOn: day("2026-01-01"),
			endsOn: day("2026-12-31"),
			monthlyFee: 24_950,
			responseHours: 4,
			notes: "Keys at the front desk",
			equipmentIds: [3, 8],
		},
	});
});

test("the customer and both days of the period are required", () => {
	expect(parse(contractFields.customerId, "")).toEqual({ issue: "Choose a customer" });
	expect(parse(contractFields.startsOn, "")).toEqual({ issue: "Choose the first day" });
	expect(parse(contractFields.endsOn, "")).toEqual({ issue: "Choose the last day" });
});

test("the level is one of the contract levels", () => {
	expect(parse(contractFields.level, "standard")).toEqual({ value: "standard" });
	expect(parse(contractFields.level, "platinum")).toHaveProperty("issue");
});

test("the monthly fee is entered in euros and can't be left out", () => {
	expect(parse(contractFields.monthlyFee, 99.99)).toEqual({ value: 9999 });
	expect(parse(contractFields.monthlyFee, undefined)).toEqual({ issue: "Enter the monthly fee" });
});

describe("responseHours", () => {
	test("is a whole number of hours, at least one", () => {
		expect(parse(contractFields.responseHours, 1)).toEqual({ value: 1 });
		expect(parse(contractFields.responseHours, 0)).toEqual({ issue: "At least 1 hour" });
		expect(parse(contractFields.responseHours, 1.5)).toEqual({ issue: "Whole hours only" });
	});

	test("an empty field asks for the hours", () => {
		expect(parse(contractFields.responseHours, undefined)).toEqual({
			issue: "Enter a number of hours",
		});
	});
});

test("empty notes are stored as none", () => {
	expect(parse(contractFields.notes, "   ")).toEqual({ value: null });
	expect(parse(contractFields.notes, "")).toEqual({ value: null });
});

describe("equipmentIds", () => {
	test("the checked units become ids", () => {
		expect(parse(contractFields.equipmentIds, ["4"])).toEqual({ value: [4] });
	});

	test("anything but an id is refused", () => {
		expect(parse(contractFields.equipmentIds, ["4", "x"])).toEqual({
			issue: "Choose units from the list",
		});
	});

	test("at least one unit must be checked, and none checked means the field is missing", () => {
		expect(parse(contractFields.equipmentIds, undefined)).toEqual({
			issue: "Choose at least one unit",
		});
		expect(parse(contractFields.equipmentIds, [])).toEqual({ issue: "Choose at least one unit" });
	});
});
