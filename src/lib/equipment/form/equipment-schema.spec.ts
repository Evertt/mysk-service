import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";

import { equipmentFields } from "./equipment-schema.ts";

/** The parsed value, or the messages of all issues. */
const parse = (schema: v.GenericSchema, input: unknown) => {
	const result = v.safeParse(schema, input);
	return result.success
		? { value: result.output }
		: { issues: result.issues.map((issue) => issue.message) };
};

test("a filled-in form becomes a unit", () => {
	const form = {
		serialNumber: "gen-2041-a",
		manufacturer: "Caterpillar",
		model: "C15",
		category: "generator",
		status: "operational",
		customerId: "7",
		installedAt: "2025-05-01",
		warrantyUntil: "2028-04-30",
	};
	expect(parse(v.object(equipmentFields), form)).toEqual({
		value: {
			...form,
			serialNumber: "GEN-2041-A",
			customerId: 7,
			installedAt: new Date(2025, 4, 1),
			warrantyUntil: new Date(2028, 3, 30),
		},
	});
});

describe("serialNumber", () => {
	const serial = (input: string) => parse(equipmentFields.serialNumber, input);

	test("is trimmed and stored in upper case", () => {
		expect(serial("  ab-12x ")).toEqual({ value: "AB-12X" });
	});

	test("an empty one only says it's required", () => {
		expect(serial("  ")).toEqual({ issues: ["Enter the serial number"] });
	});

	test.each(["AB 12", "AB_12", "AB/12", "ÄB-12"])("refuses %j", (input) => {
		expect(serial(input)).toEqual({ issues: ["Use only letters, digits and dashes"] });
	});

	test("is at most 40 characters", () => {
		expect(serial("A".repeat(40))).toEqual({ value: "A".repeat(40) });
		expect(serial("A".repeat(41))).toEqual({ issues: ["At most 40 characters"] });
	});
});

test("the category and status are chosen from the lists", () => {
	expect(parse(equipmentFields.category, "toaster")).toEqual({ issues: ["Choose a category"] });
	expect(parse(equipmentFields.status, "broken")).toEqual({ issues: ["Choose a status"] });
});

test("the customer and both dates are required", () => {
	expect(parse(equipmentFields.customerId, "")).toEqual({ issues: ["Choose a customer"] });
	expect(parse(equipmentFields.installedAt, "")).toHaveProperty(
		"issues.0",
		"Enter the installation date",
	);
	expect(parse(equipmentFields.warrantyUntil, "")).toHaveProperty(
		"issues.0",
		"Enter the end of the warranty",
	);
});
