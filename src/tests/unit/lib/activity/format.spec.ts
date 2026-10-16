import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { describeChanges, fieldLabel, formatValue, referencedIds } from "#lib/activity/format.ts";
import { coreSubjectTypes, subjectTypes } from "#lib/activity/subjects.ts";
import { formatCents, formatDate, formatDateTime } from "#lib/i18n/index.ts";
import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import { at, day } from "#unit/temporal-support.ts";

// Made-up modules instead of the ones in `src/modules`.
vi.mock("#lib/modules/manifests.gen.ts", async () => ({
	manifests: (await import("#unit/lib/modules/fakes.ts")).fakeModules,
}));

const { order, equipment, engineer, customer } = coreSubjectTypes;

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
		// An unknown value still reads.
		expect(formatValue("on_hold", order.fields?.status)).toBe("On hold");
	});

	test("shows money (in cents), dates and moments", () => {
		expect(formatValue(123456, engineer.fields?.hourlyRate)).toBe(formatCents(123456));
		const warranty = day("2026-10-07");
		expect(formatValue(warranty.toString(), equipment.fields?.warrantyUntil)).toBe(
			formatDate(warranty),
		);
		const moment = at("2026-10-07 14:05");
		expect(formatValue(moment.toString(), order.fields?.scheduledFor)).toBe(formatDateTime(moment));
		expect(formatValue(2.5, order.fields?.laborHours)).toBe("2.5 h");
	});

	test("tells days from moments in fields it doesn't know", () => {
		const date = day("2026-10-07");
		const moment = at("2026-10-07 09:30");
		expect(formatValue(date.toString())).toBe(formatDate(date));
		expect(formatValue(moment.toString())).toBe(formatDateTime(moment));
	});

	test("reads a day logged before days were days: a moment at midnight", () => {
		const midnight = at("2026-10-07 00:00");
		// As a `Date` was logged, and as a day field has it.
		expect(formatValue(new Date(midnight.epochMilliseconds).toISOString())).toBe(
			formatDate(day("2026-10-07")),
		);
		expect(formatValue(midnight.toString(), equipment.fields?.warrantyUntil)).toBe(
			formatDate(day("2026-10-07")),
		);
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
			{ field: "status", before: "Ingepland", after: "In behandeling" },
			{ field: "klant", before: "—", after: "Acme" },
			{ field: "actief", before: "ja", after: "nee" },
		]);
		expect(fieldLabel("customerId", equipment.fields?.customerId)).toBe("eigenaar");
	});
});
