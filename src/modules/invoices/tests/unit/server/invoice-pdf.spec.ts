import { inflateSync } from "node:zlib";

import { PDFDocument } from "pdf-lib";
import { describe, expect, test } from "vite-plus/test";

import { formatCents } from "#lib/i18n/index.ts";
import { invoicePdf, type PdfInvoice } from "#modules/invoices/server/invoice-pdf.ts";
import { day } from "#unit/temporal-support.ts";

/** The texts a PDF shows, in order: its content streams' strings, as pdf-lib writes them. */
async function textOf(bytes: Uint8Array) {
	const raw = Buffer.from(bytes);
	const texts: string[] = [];
	let at = 0;
	for (;;) {
		const start = raw.indexOf("stream", at);
		if (start < 0) break;
		const from = raw[start + 6] === 0x0d ? start + 8 : start + 7;
		const end = raw.indexOf("endstream", from);
		at = end + 9;
		let content: string;
		try {
			content = inflateSync(raw.subarray(from, end)).toString("latin1");
		} catch {
			content = raw.subarray(from, end).toString("latin1");
		}
		for (const [, hex] of content.matchAll(/<([0-9A-Fa-f]+)> Tj/g)) {
			// WinAnsi, the standard fonts' encoding: Latin-1 but for the euro sign.
			texts.push(Buffer.from(hex, "hex").toString("latin1").replaceAll("\x80", "€"));
		}
	}
	return texts;
}

const document: PdfInvoice = {
	organization: "Fieldworks Noord",
	number: "INV-2026-00012",
	state: "paid",
	issuedOn: day("2026-09-01"),
	dueOn: day("2026-10-01"),
	paidOn: day("2026-09-20"),
	paymentTermDays: 30,
	vatRate: 21,
	notes: null,
	customer: {
		code: "CUST-0001",
		name: "Acme",
		contactName: "Ann",
		email: "ann@acme.test",
		city: "Utrecht",
		country: "NL",
	},
	lines: [
		{
			description: "ORD-2026-00001: Repair",
			detail: "Labour",
			quantity: 1,
			unitPrice: 10_000,
			amount: 10_000,
		},
	],
	totals: { subtotal: 10_000, vat: 2100, total: 12_100 },
};

const credit: PdfInvoice = {
	...document,
	number: "CN-2026-0003",
	state: "sent",
	dueOn: null,
	paidOn: null,
	paymentTermDays: 0,
	lines: [
		{
			description: "ORD-2026-00001: Repair",
			detail: "Returned part",
			quantity: 1,
			unitPrice: -2500,
			amount: -2500,
		},
	],
	totals: { subtotal: -2500, vat: -525, total: -3025 },
	credit: { reason: "Returned part", invoice: "INV-2026-00012", settledOn: null },
};

describe("an invoice's PDF", () => {
	test("is headed as an invoice, with what to pay", async () => {
		const bytes = await invoicePdf(document);
		const texts = await textOf(bytes);
		expect(texts).toEqual(
			expect.arrayContaining(["INVOICE", "INV-2026-00012", "PAID", formatCents(12_100)]),
		);
		expect(texts.some((text) => text.startsWith("Please pay"))).toBe(true);
		expect((await PDFDocument.load(bytes)).getTitle()).toBe("Invoice INV-2026-00012");
	});
});

describe("a credit note's PDF", () => {
	test("is headed as a credit note, with the invoice it credits, its reason and negative amounts", async () => {
		const bytes = await invoicePdf(credit);
		const texts = await textOf(bytes);
		expect(texts).toEqual(
			expect.arrayContaining([
				"CREDIT NOTE",
				"CN-2026-0003",
				"Credits invoice",
				"INV-2026-00012",
				"Reason: Returned part",
				formatCents(-2500),
				formatCents(-525),
				formatCents(-3025),
			]),
		);
		expect(texts.some((text) => text.startsWith(`We credit you ${formatCents(3025)}`))).toBe(true);
		// Not what an invoice says.
		expect(texts).not.toContain("INVOICE");
		expect(texts).not.toContain("Due");
		expect(texts.some((text) => text.startsWith("Please pay"))).toBe(false);
		expect((await PDFDocument.load(bytes)).getTitle()).toBe("Credit note CN-2026-0003");
	});

	test("says when it was settled, as settled rather than paid", async () => {
		const texts = await textOf(
			await invoicePdf({
				...credit,
				state: "paid",
				credit: { ...credit.credit!, settledOn: day("2026-10-02") },
			}),
		);
		expect(texts).toEqual(expect.arrayContaining(["SETTLED", "Settled"]));
		expect(texts).not.toContain("PAID");
	});

	test("reads in Dutch as a creditnota", async () => {
		const { overwriteGetLocale, getLocale } = await import("#lib/paraglide/runtime.js");
		const before = getLocale;
		overwriteGetLocale(() => "nl");
		try {
			const texts = await textOf(await invoicePdf(credit));
			expect(texts).toEqual(expect.arrayContaining(["CREDITNOTA", "Crediteert factuur"]));
		} finally {
			overwriteGetLocale(before);
		}
	});
});
