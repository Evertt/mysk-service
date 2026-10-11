import { expect, test } from "vite-plus/test";

import { formatValue } from "#lib/activity/format.ts";
import { formatCents } from "#lib/i18n/index.ts";
import { materialActions, materialSubjects } from "#modules/materials/activity.ts";

const { material, order_line: orderLine } = materialSubjects;

test("a material's fields read as the materials pages show them", () => {
	expect(formatValue("kg", material.fields?.unit)).toBe("Kilograms");
	expect(formatValue(123456, material.fields?.unitPrice)).toBe(formatCents(123456));
	expect(material.fields?.sku?.label?.()).toBe("sku");
});

test("an order line is about its quantity", () => {
	expect(orderLine.fields?.quantity?.label?.()).toBe("quantity");
});

test("the stock verbs read as sentences", () => {
	expect(materialActions.stock_received({ user: "Jo", subject: "Filter" })).toBe(
		"Jo received stock of Filter",
	);
});
