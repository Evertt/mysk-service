import { afterEach, describe, expect, test } from "vite-plus/test";

import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";

import {
	actionSentence,
	actionVerbs,
	coreSubjectTypes,
	subjectTypeLabel,
	subjectTypes,
} from "./activity.ts";
import { activityActions } from "./models.ts";
import { type AppModule, modules } from "./modules.ts";

const { order, equipment, engineer, module } = coreSubjectTypes;

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
	test("reads nouns in Dutch", () => {
		overwriteGetLocale(() => "nl");
		expect(subjectTypeLabel("order_line", coreSubjectTypes.order_line)).toBe("Opdrachtregel");
	});
});
