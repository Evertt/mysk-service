import { afterEach, describe, expect, test } from "vite-plus/test";

import {
	contractLevels,
	contractStatuses,
	customerSegments,
	engineerSpecialties,
	equipmentCategories,
	equipmentStatuses,
	materialUnits,
	orderPriorities,
	orderStatuses,
	orderTypes,
	stockMovementKinds,
} from "#lib/models.js";
import { getLocale, type Locale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import { memberRoles } from "#lib/roles.js";

import {
	hasLabel,
	label,
	type LabelKind,
	labelOptions,
	labelOrValue,
	withLabels,
} from "./labels.ts";

const englishByDefault = getLocale;
const inLanguage = (locale: Locale) => overwriteGetLocale(() => locale);

afterEach(() => overwriteGetLocale(englishByDefault));

/** Every kind of label with all the values it must cover. */
const kinds: [LabelKind, readonly string[]][] = [
	["orderStatus", orderStatuses],
	["orderPriority", orderPriorities],
	["orderType", orderTypes],
	["customerSegment", customerSegments],
	["engineerSpecialty", engineerSpecialties],
	["equipmentCategory", equipmentCategories],
	["equipmentStatus", equipmentStatuses],
	["materialUnit", materialUnits],
	["materialUnitSymbol", materialUnits],
	["stockLevel", ["out", "low", "in_stock"]],
	["stockMovementKind", stockMovementKinds],
	["contractLevel", contractLevels],
	["contractStatus", contractStatuses],
	["slaState", ["on_track", "at_risk", "overdue", "responded"]],
	["invoiceState", ["draft", "sent", "overdue", "paid", "void"]],
	["memberRole", memberRoles],
	["memberRoleDescription", memberRoles],
];

describe.each(kinds)("%s", (kind, values) => {
	test.each<Locale>(["en", "nl"])("has a distinct label for every value in %s", (locale) => {
		inLanguage(locale);
		const labels = values.map((value) => (hasLabel(kind, value) ? label(kind, value) : ""));
		expect(labels.every((text) => text.trim() !== "")).toBe(true);
		expect(new Set(labels).size).toBe(labels.length);
	});
});

test("a label is in the current language", () => {
	expect(label("orderStatus", "in_progress")).toBe("In progress");
	inLanguage("nl");
	expect(label("orderStatus", "in_progress")).toBe("In uitvoering");
	expect(label("materialUnitSymbol", "pcs")).toBe("st.");
});

test("an unknown value is shown as it is", () => {
	expect(hasLabel("memberRole", "auditor")).toBe(false);
	expect(labelOrValue("memberRole", "auditor")).toBe("auditor");
	expect(labelOrValue("memberRole", "engineer")).toBe("Field engineer");
});

describe("made up front, e.g. at module scope", () => {
	const details = { low: { rank: 1 }, normal: { rank: 2 }, high: { rank: 3 }, urgent: { rank: 4 } };
	const priorities = withLabels("orderPriority", details);
	const options = labelOptions("orderPriority", ["urgent", "low"], details);

	test("withLabels keeps the details and translates the label when it's read", () => {
		expect(priorities.urgent).toEqual({ rank: 4, label: "Urgent" });
		inLanguage("nl");
		expect(priorities.urgent.label).toBe("Spoed");
	});

	test("labelOptions lists the values in order, translated when read", () => {
		expect(options).toEqual([
			{ value: "urgent", rank: 4, label: "Urgent" },
			{ value: "low", rank: 1, label: "Low" },
		]);
		inLanguage("nl");
		expect(options.map((option) => option.label)).toEqual(["Spoed", "Laag"]);
	});
});
