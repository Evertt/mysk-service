import { afterEach, describe, expect, test } from "vite-plus/test";

import { getLocale, type Locale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import { materialLabels } from "#modules/materials/labels.ts";
import { materialUnits, stockLevels, stockMovementKinds } from "#modules/materials/model.ts";

const englishByDefault = getLocale;
const inLanguage = (locale: Locale) => overwriteGetLocale(() => locale);

afterEach(() => overwriteGetLocale(englishByDefault));

type Kind = Parameters<typeof materialLabels.label>[0];

describe.each<[Kind, readonly string[]]>([
	["materialUnit", materialUnits],
	["materialUnitSymbol", materialUnits],
	["stockLevel", stockLevels],
	["stockMovementKind", stockMovementKinds],
])("%s", (kind, values) => {
	test.each<Locale>(["en", "nl"])("has a distinct label for every value in %s", (locale) => {
		inLanguage(locale);
		const labels = values.map((value) =>
			materialLabels.hasLabel(kind, value) ? materialLabels.label(kind, value) : "",
		);
		expect(labels.every((text) => text.trim() !== "")).toBe(true);
		expect(new Set(labels).size).toBe(labels.length);
	});
});

test("labels are in the current language", () => {
	expect(materialLabels.label("materialUnitSymbol", "pcs")).toBe("pcs");
	inLanguage("nl");
	expect(materialLabels.label("materialUnitSymbol", "pcs")).toBe("st.");
});
