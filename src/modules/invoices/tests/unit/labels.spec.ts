import { afterEach, describe, expect, test } from "vite-plus/test";

import { hasLabel } from "#lib/i18n/index.ts";
import { getLocale, type Locale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import { invoiceStates } from "#modules/invoices/invoice.ts";
import { invoicesLabels } from "#modules/invoices/labels.ts";

const englishByDefault = getLocale;
const inLanguage = (locale: Locale) => overwriteGetLocale(() => locale);

afterEach(() => overwriteGetLocale(englishByDefault));

describe("invoiceState", () => {
	test.each<Locale>(["en", "nl"])("has a distinct label for every value in %s", (locale) => {
		inLanguage(locale);
		const labels = invoiceStates.map((value) =>
			invoicesLabels.hasLabel("invoiceState", value)
				? invoicesLabels.label("invoiceState", value)
				: "",
		);
		expect(labels.every((text) => text.trim() !== "")).toBe(true);
		expect(new Set(labels).size).toBe(labels.length);
	});
});

test("labels make options and displays in the current language", () => {
	const details = { draft: { rank: 1 }, sent: { rank: 2 } };
	const options = invoicesLabels.labelOptions("invoiceState", ["sent", "draft"], details);
	const states = invoicesLabels.withLabels("invoiceState", {
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

test("the module has its own kinds, apart from the core's", () => {
	expect(invoicesLabels.hasLabel("invoiceState", "overdue")).toBe(true);
	expect(invoicesLabels.hasLabel("invoiceState", "lost")).toBe(false);
	expect(invoicesLabels.labelOrValue("invoiceState", "lost")).toBe("lost");
	expect(hasLabel("orderStatus", "quote")).toBe(true);
});
