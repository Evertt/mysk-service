import { afterEach, describe, expect, test } from "vite-plus/test";

import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";

import {
	actionSentence,
	actionVerbs,
	coreSubjectTypes,
	describeChanges,
	fieldLabel,
	formatValue,
	referencedIds,
	subjectTypeLabel,
	subjectTypes,
} from "./activity.ts";
import { formatCents, formatDate, formatDateTime } from "./format.ts";
import { activityActions } from "./models.ts";
import { type AppModule, modules } from "./modules.ts";

const { order, equipment, engineer, customer, material, module } = coreSubjectTypes;

const englishByDefault = getLocale;
afterEach(() => overwriteGetLocale(englishByDefault));

describe("actionVerbs", () => {
	test("has a sentence for every action", () => {
		const inputs = { user: "Avery", subject: "order ORD-1" };
		for (const action of activityActions) {
			expect(actionVerbs[action](inputs)).toMatch(/^Avery .+order ORD-1/);
		}
		expect(actionSentence("updated")(inputs)).toBe("Avery updated order ORD-1");
		expect(actionSentence("archived")(inputs)).toBe("Avery: archived order ORD-1");
	});

	test("has the core's verbs only", () => {
		expect(activityActions).not.toContain("issued");
		expect(Object.keys(actionVerbs).toSorted()).toEqual([...activityActions].toSorted());
	});

	test("reads a module's verbs from the module, whichever modules a tenant has", () => {
		const inputs = { user: "Avery", subject: "invoice INV-1" };
		const moduleActions = (modules as readonly AppModule[]).flatMap((entry) =>
			Object.keys(entry.actions ?? {}),
		);
		expect(moduleActions.toSorted()).toEqual(["issued", "paid", "voided"]);
		for (const action of moduleActions) {
			expect(actionSentence(action)(inputs)).toMatch(/^Avery .+invoice INV-1/);
		}
		expect(actionSentence("issued")(inputs)).toBe("Avery issued invoice INV-1");
		overwriteGetLocale(() => "nl");
		expect(actionSentence("voided")({ user: "Avery", subject: "factuur INV-1" })).toBe(
			"Avery heeft factuur INV-1 geannuleerd",
		);
	});

	test("puts the words where Dutch wants them", () => {
		overwriteGetLocale(() => "nl");
		expect(actionSentence("updated")({ user: "Avery", subject: "opdracht ORD-1" })).toBe(
			"Avery heeft opdracht ORD-1 bijgewerkt",
		);
	});
});

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
			subjectTypes(["contracts"]).contract,
			ids,
		);
		expect(Object.fromEntries([...ids].map(([type, set]) => [type, [...set]]))).toEqual({
			engineer: ["2", "3"],
			equipment: ["1", "4"],
			customer: ["9"],
		});
	});
});

describe("subjectTypes", () => {
	test("has the modules' types only for tenants with the module", () => {
		expect(subjectTypes([]).contract).toBeUndefined();
		expect(subjectTypes(["contracts"]).contract?.noun()).toBe("contract");
		expect(subjectTypes(["contracts"]).order).toBe(order);
	});

	test("links subjects to their pages", () => {
		expect(order.href?.({ id: "1", label: "ORD-2026-00001" })).toBe("/orders/ORD-2026-00001");
		expect(engineer.href?.({ id: "7", label: "Jan" })).toBe("/engineers/7");
		expect(equipment.href?.({ id: "2", label: "SN-12" })).toBe("/equipment/SN-12");
		expect(module.href?.({ id: "contracts", label: "Service contracts" })).toBe("/settings");
		expect(coreSubjectTypes.order_line.href).toBeUndefined();
	});

	test("has the invoicing module's types for tenants with it", () => {
		expect(subjectTypes([]).invoice).toBeUndefined();
		const types = subjectTypes(["invoicing"]);
		expect(types.invoice.href?.({ id: "3", label: "INV-2026-00003" })).toBe(
			"/invoices/INV-2026-00003",
		);
		expect(types.invoicing_settings.href?.({ id: "org", label: "" })).toBe("/invoices/settings");
		expect(describeChanges({ vatRate: [21, 9], status: ["draft", "sent"] }, types.invoice)).toEqual(
			[
				{ field: "VAT rate", before: "21%", after: "9%" },
				{ field: "status", before: "Draft", after: "Sent" },
			],
		);
	});

	test("shows members' roles by their labels", () => {
		expect(
			describeChanges({ role: ["member", "owner,engineer"] }, coreSubjectTypes.member),
		).toEqual([{ field: "role", before: "Member", after: "Owner, Field engineer" }]);
	});

	test("labels types for the filter", () => {
		expect(subjectTypeLabel("order_line", coreSubjectTypes.order_line)).toBe("Order line");
		expect(subjectTypeLabel("invoice")).toBe("Invoice");
		expect(subjectTypeLabel("time_entry")).toBe("Time entry");
	});

	test("shows a module by its name in the current language", () => {
		expect(module.label?.({ id: "contracts", label: "Service contracts" })).toBe(
			"Service contracts",
		);
		overwriteGetLocale(() => "nl");
		expect(module.label?.({ id: "contracts", label: "Service contracts" })).toBe(
			"Servicecontracten",
		);
		expect(module.label?.({ id: "gone", label: "Gone" })).toBe("Gone");
	});
});

describe("in Dutch", () => {
	test("reads nouns, field labels and values in Dutch", () => {
		overwriteGetLocale(() => "nl");
		expect(subjectTypeLabel("order_line", coreSubjectTypes.order_line)).toBe("Opdrachtregel");
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
		const invoice = subjectTypes(["invoicing"]).invoice;
		expect(describeChanges({ paymentTermDays: [14, 30], vatRate: [21, 5.5] }, invoice)).toEqual([
			{ field: "betalingstermijn", before: "14 dagen", after: "30 dagen" },
			{ field: "btw-tarief", before: "21%", after: "5,5%" },
		]);
	});
});
