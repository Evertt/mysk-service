import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { customerSubject, equipmentSubject, orderSubject } from "#lib/activity/page-subjects.ts";
import {
	actionSentence,
	actionVerbs,
	coreSubjectTypes,
	subjectTypeLabel,
	subjectTypes,
} from "#lib/activity/subjects.ts";
import { activityActions } from "#lib/models.ts";
import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";

// Made-up modules instead of the ones in `src/modules`.
vi.mock("#lib/modules/manifests.gen.ts", async () => ({
	manifests: (await import("#unit/lib/modules/fakes.ts")).fakeModules,
}));

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
		const inputs = { user: "Avery", subject: "widget W-1" };
		expect(activityActions).not.toContain("approved");
		expect(actionSentence("approved")(inputs)).toBe("Avery approved widget W-1");
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
		expect(subjectTypes([]).widget).toBeUndefined();
		expect(subjectTypes(["gadgets"]).widget).toBeUndefined();
		expect(subjectTypes(["widgets"]).widget?.noun()).toBe("widget");
		expect(subjectTypes(["widgets"]).order).toBe(order);
	});

	test("links subjects to their pages", () => {
		expect(order.href?.({ id: "1", label: "ORD-2026-00001" })).toBe("/orders/ORD-2026-00001");
		expect(engineer.href?.({ id: "7", label: "Jan" })).toBe("/engineers/7");
		expect(equipment.href?.({ id: "2", label: "SN-12" })).toBe("/equipment/SN-12");
		expect(module.href?.({ id: "widgets", label: "Widgets" })).toBe("/settings");
	});

	test("links the subjects of orders, customers and units, as their builders make them, to their pages", () => {
		const linked = (subject: {
			type: "order" | "customer" | "equipment";
			id: number;
			label: string;
		}) => coreSubjectTypes[subject.type].href?.({ id: String(subject.id), label: subject.label });
		expect(linked(orderSubject({ id: 1, number: "ORD-2026-00001" }))).toBe(
			"/orders/ORD-2026-00001",
		);
		expect(linked(customerSubject({ id: 2, code: "C-0042" }))).toBe("/customers/C-0042");
		expect(linked(equipmentSubject({ id: 3, serialNumber: "SN-12" }))).toBe("/equipment/SN-12");
	});

	test("links a module's subjects to its pages", () => {
		const { widget } = subjectTypes(["widgets"]);
		expect(widget.href?.({ id: "3", label: "W-3" })).toBe("/widgets/W-3");
	});

	test("labels types for the filter", () => {
		expect(subjectTypeLabel("saved_view", coreSubjectTypes.saved_view)).toBe("Saved view");
		expect(subjectTypeLabel("widget", subjectTypes(["widgets"]).widget)).toBe("Widget");
		expect(subjectTypeLabel("time_entry")).toBe("Time entry");
	});

	test("shows a module by its name", () => {
		expect(module.label?.({ id: "widgets", label: "Old name" })).toBe("Widgets");
		expect(module.label?.({ id: "gone", label: "Gone" })).toBe("Gone");
	});
});

describe("in Dutch", () => {
	test("reads nouns in Dutch", () => {
		overwriteGetLocale(() => "nl");
		expect(subjectTypeLabel("saved_view", coreSubjectTypes.saved_view)).toBe("Opgeslagen weergave");
	});
});
