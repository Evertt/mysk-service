import { afterEach, describe, expect, test } from "vite-plus/test";

import { describeChanges } from "#lib/activity/format.ts";
import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";

import { invoicingActions, invoicingSubjects, lineNote } from "./activity.ts";

const englishByDefault = getLocale;
afterEach(() => overwriteGetLocale(englishByDefault));

const { invoice, invoice_line: line, invoicing_settings: settings } = invoicingSubjects;

describe("invoicingActions", () => {
	const inputs = { user: "Avery", subject: "invoice INV-1" };

	test("has a sentence for every verb it adds", () => {
		expect(Object.keys(invoicingActions).toSorted()).toEqual(["issued", "paid", "voided"]);
		for (const sentence of Object.values(invoicingActions)) {
			expect(sentence(inputs)).toMatch(/^Avery .+invoice INV-1/);
		}
		expect(invoicingActions.issued(inputs)).toBe("Avery issued invoice INV-1");
	});

	test("puts the words where Dutch wants them", () => {
		overwriteGetLocale(() => "nl");
		expect(invoicingActions.voided({ user: "Avery", subject: "factuur INV-1" })).toBe(
			"Avery heeft factuur INV-1 geannuleerd",
		);
	});
});

describe("invoicingSubjects", () => {
	test("links an invoice and the settings to their pages", () => {
		expect(invoice.href?.({ id: "3", label: "INV-2026-00003" })).toBe("/invoices/INV-2026-00003");
		expect(settings.href?.({ id: "org", label: "" })).toBe("/invoices/settings");
		expect(line.href).toBeUndefined();
	});

	test("reads an invoice's fields", () => {
		expect(describeChanges({ vatRate: [21, 9], status: ["draft", "sent"] }, invoice)).toEqual([
			{ field: "VAT rate", before: "21%", after: "9%" },
			{ field: "status", before: "Draft", after: "Sent" },
		]);
	});

	test("reads them in Dutch", () => {
		overwriteGetLocale(() => "nl");
		expect(describeChanges({ paymentTermDays: [14, 30], vatRate: [21, 5.5] }, invoice)).toEqual([
			{ field: "betalingstermijn", before: "14 dagen", after: "30 dagen" },
			{ field: "btw-tarief", before: "21%", after: "5,5%" },
		]);
	});
});

describe("lineNote", () => {
	test("is the amount of a single item", () => {
		expect(lineNote({ quantity: 1, unitPrice: 4500, amount: 4500 })).toBe("€45.00");
	});

	test("shows the sum of several", () => {
		expect(lineNote({ quantity: 2, unitPrice: 4500, amount: 9000 })).toBe("2 × €45.00 = €90.00");
	});
});
