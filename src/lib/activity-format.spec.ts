import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";

import { describeChanges, fieldLabel, formatValue, referencedIds } from "./activity-format.ts";
import { coreSubjectTypes, subjectTypes } from "./activity.ts";
import { formatCents, formatDate, formatDateTime } from "./format.ts";

// Made-up modules instead of the ones in `src/modules`.
vi.mock("./modules/manifests.gen.ts", async () => ({
	manifests: (await import("./modules/fakes.ts")).fakeModules,
}));

const { order, equipment, engineer, customer, material } = coreSubjectTypes;

const englishByDefault = getLocale;
afterEach(() => overwriteGetLocale(englishByDefault));

describe("fieldLabel", () => {
	test("makes a label from the field's name", () => {
		expect(fieldLabel("engineerId")).toBe("engineer");
		expect(fieldLabel("scheduledFor")).toBe("scheduled for");
		expect(fieldLabel("equipmentIds")).toBe("equipment");
		expect(fieldLabel("unit_price")).toBe("unit price");
		expect(fieldLabel("city")).toBe("city");
	});

	test("prefers the subject type's label", () => {
		expect(fieldLabel("customerId", equipment.fields?.customerId)).toBe("owner");
	});
});

describe("formatValue", () => {
	test("shows nothing as a dash", () => {
		for (const value of [null, undefined, "", []]) expect(formatValue(value)).toBe("—");
	});

	test("shows enums by their labels", () => {
		expect(formatValue("in_progress", order.fields?.status)).toBe("In progress");
		expect(formatValue("urgent", order.fields?.priority)).toBe("Urgent");
		expect(formatValue("hvac", engineer.fields?.specialty)).toBe("HVAC");
		expect(formatValue("mid_market", customer.fields?.segment)).toBe("Mid-market");
		expect(formatValue("out_of_service", equipment.fields?.status)).toBe("Out of service");
		expect(formatValue("kg", material.fields?.unit)).toBe("Kilograms");
		// An unknown value still reads.
		expect(formatValue("on_hold", order.fields?.status)).toBe("On hold");
	});

	test("shows money (in cents), dates and moments", () => {
		expect(formatValue(123456, material.fields?.unitPrice)).toBe(formatCents(123456));
		const day = new Date(2026, 9, 7);
		expect(formatValue(day.toISOString(), equipment.fields?.warrantyUntil)).toBe(formatDate(day));
		const moment = new Date(2026, 9, 7, 14, 5);
		expect(formatValue(moment.toISOString(), order.fields?.scheduledFor)).toBe(
			formatDateTime(moment),
		);
		expect(formatValue(2.5, order.fields?.laborHours)).toBe("2.5 h");
	});

	test("tells dates from moments in fields it doesn't know", () => {
		const day = new Date(2026, 9, 7);
		const moment = new Date(2026, 9, 7, 9, 30);
		expect(formatValue(day.toISOString())).toBe(formatDate(day));
		expect(formatValue(moment.toISOString())).toBe(formatDateTime(moment));
	});

	test("shows referenced records by name, or by id if unknown", () => {
		const names = { engineer: { "3": "Jan de Vries" }, equipment: { "1": "SN-1", "2": "SN-2" } };
		expect(formatValue(3, order.fields?.engineerId, names)).toBe("Jan de Vries");
		expect(formatValue(4, order.fields?.engineerId, names)).toBe("#4");
		expect(formatValue([1, 2], { ref: "equipment" }, names)).toBe("SN-1, SN-2");
	});

	test("shows other values as they are, long texts shortened", () => {
		expect(formatValue(true)).toBe("yes");
		expect(formatValue(false)).toBe("no");
		expect(formatValue(1250.5)).toBe("1,250.5");
		expect(formatValue("Amersfoort")).toBe("Amersfoort");
		const long = formatValue("x".repeat(200));
		expect(long).toHaveLength(80);
		expect(long.endsWith("…")).toBe(true);
	});
});

describe("describeChanges", () => {
	test("reads an order's changes", () => {
		expect(
			describeChanges(
				{ status: ["scheduled", "in_progress"], engineerId: [null, 3], description: ["a", "b"] },
				order,
				{ engineer: { "3": "Jan" } },
			),
		).toEqual([
			{ field: "status", before: "Scheduled", after: "In progress" },
			{ field: "engineer", before: "—", after: "Jan" },
			{ field: "description", before: "a", after: "b" },
		]);
	});

	test("reads without changes or a known type", () => {
		expect(describeChanges(null, order)).toEqual([]);
		expect(describeChanges({ seats: [1, 2] })).toEqual([
			{ field: "seats", before: "1", after: "2" },
		]);
	});
});

describe("referencedIds", () => {
	test("collects the ids that fields refer to, by type", () => {
		const ids = referencedIds({ engineerId: [2, 3], status: ["a", "b"] }, order);
		referencedIds(
			{ equipmentIds: [[1], [1, 4]], customerId: [null, 9] },
			subjectTypes(["widgets"]).widget,
			ids,
		);
		expect(Object.fromEntries([...ids].map(([type, set]) => [type, [...set]]))).toEqual({
			engineer: ["2", "3"],
			equipment: ["1", "4"],
			customer: ["9"],
		});
	});
});

describe("describeChanges for a module's subject types", () => {
	test("reads a module's fields with the labels and formats it gives them", () => {
		const { widget } = subjectTypes(["widgets"]);
		expect(describeChanges({ size: [10, 12] }, widget)).toEqual([
			{ field: "size of the widget", before: "10 cm", after: "12 cm" },
		]);
	});

	test("labels a module's field for tenants without the module as well", () => {
		expect(fieldLabel("size")).toBe("size of the widget");
	});

	test("shows members' roles by their labels", () => {
		expect(
			describeChanges({ role: ["member", "owner,engineer"] }, coreSubjectTypes.member),
		).toEqual([{ field: "role", before: "Member", after: "Owner, Field engineer" }]);
	});
});

describe("in Dutch", () => {
	test("reads field labels and values in Dutch", () => {
		overwriteGetLocale(() => "nl");
		expect(
			describeChanges(
				{ status: ["scheduled", "in_progress"], customerId: [null, 1], active: [true, false] },
				order,
				{ customer: { "1": "Acme" } },
			),
		).toEqual([
			{ field: "status", before: "Ingepland", after: "In uitvoering" },
			{ field: "klant", before: "—", after: "Acme" },
			{ field: "actief", before: "ja", after: "nee" },
		]);
		expect(fieldLabel("customerId", equipment.fields?.customerId)).toBe("eigenaar");
	});
});
