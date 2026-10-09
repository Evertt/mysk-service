import { afterEach, describe, expect, test } from "vite-plus/test";

import { hasLabel } from "#lib/i18n";
import { getLocale, type Locale, overwriteGetLocale } from "#lib/paraglide/runtime.js";

import { contractLabels } from "./labels.ts";
import { contractLevels, contractStatuses } from "./model.ts";

const englishByDefault = getLocale;
const inLanguage = (locale: Locale) => overwriteGetLocale(() => locale);

afterEach(() => overwriteGetLocale(englishByDefault));

type Kind = Parameters<typeof contractLabels.label>[0];

describe.each<[Kind, readonly string[]]>([
	["contractLevel", contractLevels],
	["contractStatus", contractStatuses],
	["slaState", ["on_track", "at_risk", "overdue", "responded"]],
])("%s", (kind, values) => {
	test.each<Locale>(["en", "nl"])("has a distinct label for every value in %s", (locale) => {
		inLanguage(locale);
		const labels = values.map((value) =>
			contractLabels.hasLabel(kind, value) ? contractLabels.label(kind, value) : "",
		);
		expect(labels.every((text) => text.trim() !== "")).toBe(true);
		expect(new Set(labels).size).toBe(labels.length);
	});
});

test("labels are in the current language", () => {
	expect(contractLabels.label("slaState", "at_risk")).toBe("At risk");
	inLanguage("nl");
	expect(contractLabels.label("slaState", "at_risk")).toBe("Risico");
});

test("the module has its own kinds, apart from the core's", () => {
	expect(contractLabels.hasLabel("contractLevel", "premium")).toBe(true);
	expect(contractLabels.hasLabel("contractLevel", "gold")).toBe(false);
	expect(contractLabels.labelOrValue("contractLevel", "gold")).toBe("gold");
	expect(hasLabel("orderStatus", "quote")).toBe(true);
});
