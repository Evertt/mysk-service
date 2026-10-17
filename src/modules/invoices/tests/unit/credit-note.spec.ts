import { describe, expect, test } from "vite-plus/test";

import { formatCode, sequenceStart } from "#lib/numbering.ts";
import {
	canCredit,
	type CreditableLine,
	creditLines,
	creditTotals,
	holdsCredit,
	isIssued,
	leftOf,
	remainingOf,
	typedCreditLine,
} from "#modules/invoices/credit-note.ts";
import { invoiceTotals } from "#modules/invoices/invoice.ts";
import { creditNoteNumberFormat } from "#modules/invoices/model.ts";

const line = (
	id: number,
	amount: number,
	fields: Partial<CreditableLine> = {},
): CreditableLine => ({
	id,
	description: `Line ${id}`,
	detail: null,
	quantity: 1,
	unitPrice: amount,
	amount,
	orderId: null,
	source: null,
	credited: 0,
	...fields,
});

/** An order's price (two parts at €60), a contract's discount of €30 and a fee of €50. */
const lines = [
	line(1, 12_000, { quantity: 2, unitPrice: 6000, orderId: 7 }),
	line(2, -3000, { orderId: 7 }),
	line(3, 5000, { source: "contracts:1:2026-10-01" }),
];
const subtotal = lines.reduce((sum, each) => sum + each.amount, 0);
/** What's left of the invoice to credit: its subtotal less the earlier credits. */
const leftOfInvoice = (all: CreditableLine[]) => all.reduce((sum, each) => sum + leftOf(each), 0);
const all = (of: CreditableLine[]) =>
	of.map((each) => ({ lineId: each.id, amount: Math.abs(leftOf(each)) }));

describe("crediting an invoice", () => {
	test("in full mirrors its lines, discount and all, and credits its subtotal", () => {
		const made = creditLines(lines, all(lines), subtotal);
		if (!("lines" in made)) throw new Error("refused");
		expect(made.lines).toEqual([
			expect.objectContaining({
				quantity: 2,
				unitPrice: -6000,
				amount: -12_000,
				invoiceLineId: 1,
				orderId: 7,
			}),
			expect.objectContaining({
				quantity: 1,
				unitPrice: 3000,
				amount: 3000,
				invoiceLineId: 2,
				orderId: 7,
			}),
			expect.objectContaining({
				amount: -5000,
				invoiceLineId: 3,
				source: "contracts:1:2026-10-01",
			}),
		]);
		const credited = made.lines.reduce((sum, each) => sum + each.amount, 0);
		expect(credited).toBe(-subtotal);
		// At the invoice's rate, its VAT and total are the invoice's, negative.
		const invoice = invoiceTotals(lines, 21);
		expect(creditTotals(credited, 21)).toEqual({
			subtotal: -invoice.subtotal,
			vat: -invoice.vat,
			total: -invoice.total,
		});
	});

	test("in part credits an amount of a line, as one item", () => {
		const made = creditLines(lines, [{ lineId: 1, amount: 2500 }], subtotal);
		expect(made).toEqual({
			lines: [
				{
					description: "Line 1",
					detail: null,
					quantity: 1,
					unitPrice: -2500,
					amount: -2500,
					invoiceLineId: 1,
					orderId: 7,
					source: null,
				},
			],
		});
	});

	test("leaves out lines it credits nothing of", () => {
		const made = creditLines(
			lines,
			[
				{ lineId: 1, amount: 0 },
				{ lineId: 3, amount: 1000 },
			],
			subtotal,
		);
		expect("lines" in made && made.lines.map((each) => each.invoiceLineId)).toEqual([3]);
	});

	test("never more than is left of a line after earlier credits", () => {
		const credited = [line(1, 12_000, { credited: -10_000 }), ...lines.slice(1)];
		expect(creditLines(credited, [{ lineId: 1, amount: 2001 }], leftOfInvoice(credited))).toEqual({
			problems: [{ kind: "more_than_left", lineId: 1, description: "Line 1", left: 2000 }],
		});
		// What's left of it, it may.
		expect(
			"lines" in creditLines(credited, [{ lineId: 1, amount: 2000 }], leftOfInvoice(credited)),
		).toBe(true);
		// Once a line is credited in part, the rest of it is an amount, not its quantity.
		const rest = creditLines(credited, [{ lineId: 1, amount: 2000 }], leftOfInvoice(credited));
		expect("lines" in rest && rest.lines[0]).toMatchObject({ quantity: 1, unitPrice: -2000 });
	});

	test("never more than is left of the invoice, discounts taken into account", () => {
		// The order's price without taking its discount back: more than the invoice's €140.
		const tooMuch = creditLines(
			lines,
			[
				{ lineId: 1, amount: 12_000 },
				{ lineId: 3, amount: 5000 },
			],
			subtotal,
		);
		expect(tooMuch).toEqual({ problems: [{ kind: "more_than_invoice", left: subtotal }] });
		// After an earlier credit note of €100, only €40 is left.
		expect(creditLines(lines, [{ lineId: 1, amount: 5000 }], subtotal - 10_000)).toEqual({
			problems: [{ kind: "more_than_invoice", left: 4000 }],
		});
	});

	test("refuses a line that isn't the invoice's, a negative amount, or crediting nothing", () => {
		expect(creditLines(lines, [{ lineId: 99, amount: 100 }], subtotal)).toEqual({
			problems: [{ kind: "unknown_line", lineId: 99 }],
		});
		expect(creditLines(lines, [{ lineId: 1, amount: -100 }], subtotal)).toMatchObject({
			problems: [{ kind: "more_than_left" }],
		});
		expect(creditLines(lines, [], subtotal)).toEqual({ problems: [{ kind: "nothing" }] });
		// Taking the discount back alone would charge the customer more.
		expect(creditLines(lines, [{ lineId: 2, amount: 3000 }], subtotal)).toEqual({
			problems: [{ kind: "nothing" }],
		});
	});
});

describe("a standalone credit note's line", () => {
	test("credits what's typed in, as a negative price", () => {
		expect(
			typedCreditLine({ description: "Goodwill", quantity: 2, unitPrice: 2550, source: "x:1" }),
		).toEqual({
			description: "Goodwill",
			detail: null,
			quantity: 2,
			unitPrice: -2550,
			amount: -5100,
			invoiceLineId: null,
			orderId: null,
			source: "x:1",
		});
	});
});

describe("what's left to pay", () => {
	const invoice = invoiceTotals(lines, 21);

	test("is the invoice's total less its issued credit notes'", () => {
		const credit = creditTotals(-2500, 21);
		expect(remainingOf(invoice, [credit])).toBe(invoice.total + credit.total);
		expect(remainingOf(invoice, [])).toBe(invoice.total);
	});

	test("is nothing once its subtotal is credited in full, whatever the rounding", () => {
		// Two credits of a third each and the rest: the VAT of each is rounded on its own.
		const thirds = [creditTotals(-4667, 21), creditTotals(-4667, 21), creditTotals(-4666, 21)];
		expect(thirds.reduce((sum, each) => sum + each.subtotal, 0)).toBe(-subtotal);
		expect(remainingOf(invoice, thirds)).toBe(0);
	});
});

describe("statuses", () => {
	test("only sent or paid invoices can be credited", () => {
		expect(
			["draft", "sent", "paid", "void"].filter((status) => canCredit(status as never)),
		).toEqual(["sent", "paid"]);
	});

	test("a credit note holds credit unless void, and counts against what's owed once issued", () => {
		const statuses = ["draft", "sent", "paid", "void"] as const;
		expect(statuses.filter(holdsCredit)).toEqual(["draft", "sent", "paid"]);
		expect(statuses.filter(isIssued)).toEqual(["sent", "paid"]);
	});
});

describe("numbers", () => {
	test("are a series of their own, with the year", () => {
		expect(formatCode(creditNoteNumberFormat, 1, 2026)).toBe("CN-2026-0001");
		expect(formatCode(creditNoteNumberFormat, 12_345, 2027)).toBe("CN-2027-12345");
		// Where `nextNumber()` reads the sequence: after `CN-2026-`.
		expect("CN-2026-0042".slice(sequenceStart(creditNoteNumberFormat) - 1)).toBe("0042");
	});
});
