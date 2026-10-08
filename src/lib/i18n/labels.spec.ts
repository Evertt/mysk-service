import { afterEach, describe, expect, test } from "vite-plus/test";

import { contractLabels } from "#lib/components/contracts/labels.js";
import { contractLevels, contractStatuses } from "#lib/components/contracts/model.js";
import { invoicingLabels } from "#lib/components/invoicing/labels.js";
import {
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
	defineLabels,
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
	["memberRole", memberRoles],
	["memberRoleDescription", memberRoles],
];

/** What the tests need of a set of labels: the core's, or one made by `defineLabels()`. */
interface LabelSet {
	hasLabel(kind: string, value: string): boolean;
	label(kind: string, value: string): string;
}

/** Every kind has a distinct, non-empty label for each of its values, in both languages. */
function testKinds(set: LabelSet, kinds: readonly (readonly [string, readonly string[]])[]) {
	describe.each(kinds)("%s", (kind, values) => {
		test.each<Locale>(["en", "nl"])("has a distinct label for every value in %s", (locale) => {
			inLanguage(locale);
			const labels = values.map((value) =>
				set.hasLabel(kind, value) ? set.label(kind, value) : "",
			);
			expect(labels.every((text) => text.trim() !== "")).toBe(true);
			expect(new Set(labels).size).toBe(labels.length);
		});
	});
}

testKinds({ hasLabel, label }, kinds);

describe("contracts labels", () => {
	testKinds(contractLabels, [
		["contractLevel", contractLevels],
		["contractStatus", contractStatuses],
		["slaState", ["on_track", "at_risk", "overdue", "responded"]],
	]);

	test("are in the current language", () => {
		expect(contractLabels.label("slaState", "at_risk")).toBe("At risk");
		inLanguage("nl");
		expect(contractLabels.label("slaState", "at_risk")).toBe("Risico");
	});

	test("have their own kinds, apart from the core's", () => {
		expect(contractLabels.hasLabel("contractLevel", "premium")).toBe(true);
		expect(contractLabels.hasLabel("contractLevel", "gold")).toBe(false);
		expect(contractLabels.labelOrValue("contractLevel", "gold")).toBe("gold");
		expect(hasLabel("orderStatus", "quote")).toBe(true);
	});
});

describe("invoicing labels", () => {
	testKinds(invoicingLabels, [["invoiceState", ["draft", "sent", "overdue", "paid", "void"]]]);

	test("make options and displays in the current language", () => {
		const details = { draft: { rank: 1 }, sent: { rank: 2 } };
		const options = invoicingLabels.labelOptions("invoiceState", ["sent", "draft"], details);
		const states = invoicingLabels.withLabels("invoiceState", {
			...details,
			overdue: { rank: 3 },
			paid: { rank: 4 },
			void: { rank: 5 },
		});
		expect(options.map((option) => option.value)).toEqual(["sent", "draft"]);
		expect(states.sent).toEqual({ rank: 2, label: "Sent" });
		inLanguage("nl");
		expect(states.sent.label).toBe("Verzonden");
		expect(options[0].label).toBe("Verzonden");
	});
});

describe("defineLabels", () => {
	const colours = defineLabels({ colour: { red: () => "Red", blue: () => "Blue" } });

	test("binds the functions to the kinds it's given", () => {
		expect(colours.label("colour", "red")).toBe("Red");
		expect(colours.hasLabel("colour", "green")).toBe(false);
		expect(colours.labelOrValue("colour", "green")).toBe("green");
		expect(colours.labelOptions("colour", ["blue"])).toEqual([{ value: "blue", label: "Blue" }]);
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
