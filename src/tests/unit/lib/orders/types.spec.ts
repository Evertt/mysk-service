import { afterEach, describe, expect, test } from "vite-plus/test";

import { label, labelOptions, labelOrValue, overwriteTenantNames } from "#lib/i18n/labels.ts";
import { orderTypes } from "#lib/models.ts";
import { types, typeOptions } from "#lib/orders/display.ts";
import {
	effectiveOrderTypes,
	nameOrderTypes,
	offeredOrderTypes,
	type OrderTypeSettings,
	orderTypeProblems,
	typeName,
} from "#lib/orders/types.ts";
import { getLocale, type Locale, overwriteGetLocale } from "#lib/paraglide/runtime.js";

const englishByDefault = getLocale;
const inLanguage = (locale: Locale) => overwriteGetLocale(() => locale);

afterEach(() => {
	overwriteGetLocale(englishByDefault);
	overwriteTenantNames(() => undefined);
});

const shltr: OrderTypeSettings = {
	survey: { names: { nl: "Offerte-opname" }, hidden: false },
	damage: { names: {}, hidden: true },
	project: { names: { en: "Job", nl: "Klus" }, hidden: false },
};

describe("labels with the tenant's names", () => {
	test("without names, every type has its standard label", () => {
		nameOrderTypes(() => undefined);
		expect(label("orderType", "survey")).toBe("Survey");
		inLanguage("nl");
		expect(label("orderType", "survey")).toBe("Offerte opname");
	});

	test("a name the tenant gave wins in its language; others keep the standard label", () => {
		nameOrderTypes(() => shltr);
		expect(label("orderType", "survey")).toBe("Survey");
		expect(label("orderType", "project")).toBe("Job");
		inLanguage("nl");
		expect(label("orderType", "survey")).toBe("Offerte-opname");
		expect(label("orderType", "project")).toBe("Klus");
		expect(label("orderType", "breakdown")).toBe("Storing");
	});

	test("reaches what's made with the labels: display maps, options, labelOrValue", () => {
		nameOrderTypes(() => shltr);
		expect(types.project.label).toBe("Job");
		expect(typeOptions.find((option) => option.value === "project")?.label).toBe("Job");
		expect(labelOptions("orderType", ["project"])[0].label).toBe("Job");
		expect(labelOrValue("orderType", "project")).toBe("Job");
	});

	test("reads the names when shown, so a change shows at once", () => {
		let settings: OrderTypeSettings = {};
		nameOrderTypes(() => settings);
		const options = labelOptions("orderType", ["survey"]);
		expect(options[0].label).toBe("Survey");
		settings = { survey: { names: { en: "Site visit" }, hidden: false } };
		expect(options[0].label).toBe("Site visit");
	});

	test("leaves other kinds of labels alone", () => {
		nameOrderTypes(() => ({ quote: { names: { en: "Offer" }, hidden: false } }) as never);
		expect(label("orderStatus", "quote")).toBe("Quote");
	});

	test("typeName reads a type in any language, the standard label without a name", () => {
		expect(typeName(shltr, "survey", "nl")).toBe("Offerte-opname");
		expect(typeName(shltr, "survey", "en")).toBe("Survey");
		expect(typeName(undefined, "damage", "nl")).toBe("Schade");
	});
});

describe("the types the order form offers", () => {
	test("all of them, in their order, without settings", () => {
		expect(offeredOrderTypes(undefined)).toEqual(orderTypes);
		expect(offeredOrderTypes({})).toEqual(orderTypes);
	});

	test("leaves out a hidden type", () => {
		expect(offeredOrderTypes(shltr)).toEqual(orderTypes.filter((type) => type !== "damage"));
	});

	test("keeps a hidden type that's the order's own", () => {
		expect(offeredOrderTypes(shltr, "damage")).toEqual(orderTypes);
		expect(offeredOrderTypes(shltr, "repair")).not.toContain("damage");
	});

	test("as they work, a type something needs is never hidden", () => {
		const settings: OrderTypeSettings = {
			inspection: { names: { en: "Check" }, hidden: true },
			damage: { names: {}, hidden: true },
		};
		expect(effectiveOrderTypes(settings, new Set(["inspection"]))).toEqual({
			inspection: { names: { en: "Check" }, hidden: false },
			damage: { names: {}, hidden: true },
		});
	});
});

describe("what's refused", () => {
	const none = new Map();
	const shown = { names: {}, hidden: false };
	const hidden = { names: {}, hidden: true };

	test("nothing for a new name or hiding a type nothing needs", () => {
		expect(
			orderTypeProblems(shltr, "repair", { names: { nl: "Herstel" }, hidden: false }, none),
		).toEqual([]);
		expect(orderTypeProblems(shltr, "other", hidden, none)).toEqual([]);
	});

	test("hiding a type that something needs, saying what", () => {
		const required = new Map([["inspection" as const, ["Checklists", "Maintenance"]]]);
		expect(orderTypeProblems({}, "inspection", hidden, required)).toEqual([
			{ field: "hidden", reason: "required", by: ["Checklists", "Maintenance"] },
		]);
		// Renaming it is fine.
		expect(
			orderTypeProblems({}, "inspection", { names: { en: "Check" }, hidden: false }, required),
		).toEqual([]);
	});

	test("hiding the last type shown", () => {
		const allButOther = Object.fromEntries(
			orderTypes.filter((type) => type !== "other").map((type) => [type, hidden]),
		);
		expect(orderTypeProblems(allButOther, "other", hidden, none)).toEqual([
			{ field: "hidden", reason: "last" },
		]);
		expect(orderTypeProblems(allButOther, "other", shown, none)).toEqual([]);
	});

	test("a name another type has in that language, whatever the case", () => {
		expect(
			orderTypeProblems(shltr, "repair", { names: { nl: "offerte-OPNAME" }, hidden: false }, none),
		).toEqual([
			{ field: "names", locale: "nl", reason: "taken", name: "offerte-OPNAME", other: "survey" },
		]);
		// Another type's standard label counts too, unless that type has a name of its own.
		expect(
			orderTypeProblems({}, "other", { names: { en: "Repair" }, hidden: false }, none),
		).toEqual([{ field: "names", locale: "en", reason: "taken", name: "Repair", other: "repair" }]);
		expect(
			orderTypeProblems(shltr, "other", { names: { nl: "Offerte opname" }, hidden: false }, none),
		).toEqual([]);
	});

	test("a type may have its own standard label as its name", () => {
		expect(
			orderTypeProblems({}, "survey", { names: { en: "Survey" }, hidden: false }, none),
		).toEqual([]);
	});
});
