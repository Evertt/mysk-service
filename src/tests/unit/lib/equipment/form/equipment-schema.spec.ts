import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";

import { equipmentFields } from "#lib/equipment/form/equipment-schema.ts";
import { day } from "#unit/temporal-support.ts";

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
		categoryId: "3",
		status: "operational",
		customerId: "7",
		siteId: "12",
		name: "  Automatische deur kantine BES-3 ",
		location: "Expeditie dock 07",
		installedAt: "2025-05-01",
		warrantyUntil: "2028-04-30",
	};
	expect(parse(v.object(equipmentFields), form)).toEqual({
		value: {
			...form,
			serialNumber: "GEN-2041-A",
			categoryId: 3,
			customerId: 7,
			siteId: 12,
			name: "Automatische deur kantine BES-3",
			installedAt: day("2025-05-01"),
			warrantyUntil: day("2028-04-30"),
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
	// One of the tenant's categories, by id; the server checks it's the tenant's.
	expect(parse(equipmentFields.categoryId, "")).toEqual({ issues: ["Choose a category"] });
	expect(parse(equipmentFields.categoryId, "0")).toEqual({ issues: ["Choose a category"] });
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

describe("site, name and location", () => {
	test("a unit is at a site", () => {
		expect(parse(equipmentFields.siteId, "")).toEqual({ issues: ["Choose a site"] });
		expect(parse(equipmentFields.siteId, "3")).toEqual({ value: 3 });
	});

	test("its name and location are optional, and nothing when left empty", () => {
		expect(parse(equipmentFields.name, "  ")).toEqual({ value: null });
		expect(parse(equipmentFields.location, "")).toEqual({ value: null });
		expect(parse(equipmentFields.location, " Hal 2 ")).toEqual({ value: "Hal 2" });
	});

	test("are at most 120 characters", () => {
		expect(parse(equipmentFields.name, "A".repeat(121))).toEqual({
			issues: ["Use at most 120 characters"],
		});
	});
});
