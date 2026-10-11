import { describe, expect, test } from "vite-plus/test";

import { formatRate } from "#modules/invoicing/display.ts";
import {
	canChange,
	dueDate,
	invoiceState,
	invoiceTotals,
	isEditable,
	isOverdue,
	itemLine,
	lineAmount,
	orderLines,
	roundCents,
	today,
	vatOf,
} from "#modules/invoicing/invoice.ts";
import { invoiceStatuses } from "#modules/invoicing/model.ts";

describe("amounts", () => {
	test("round to the cent, halves away from zero", () => {
		expect(roundCents(2.5)).toBe(3);
		expect(roundCents(-2.5)).toBe(-3);
		expect(roundCents(2.49)).toBe(2);
		expect(Object.is(roundCents(-0.4), 0)).toBe(true);
	});

	test("a line is its quantity times its unit price", () => {
		expect(lineAmount(3, 1999)).toBe(5997);
		expect(lineAmount(1.5, 333)).toBe(500);
		expect(lineAmount(2, -1250)).toBe(-2500);
	});

	test("VAT is the subtotal times the rate, rounded once", () => {
		expect(vatOf(10_000, 21)).toBe(2100);
		expect(vatOf(1050, 21)).toBe(221); // 220.5
		expect(vatOf(1049, 21)).toBe(220); // 220.29
		expect(vatOf(999, 9)).toBe(90); // 89.91
		expect(vatOf(-1050, 21)).toBe(-221);
		expect(vatOf(12_345, 0)).toBe(0);
	});

	test("totals add the lines up, then the VAT on their sum", () => {
		// Per line, the VAT would be 2 × 0.21 = 0.42 → 0 + 0 cents; on the sum, 0.42 → 0 too, but
		// 3 × 0.21 = 0.63 → 1 cent.
		expect(invoiceTotals([{ amount: 1 }, { amount: 1 }, { amount: 1 }], 21)).toEqual({
			subtotal: 3,
			vat: 1,
			total: 4,
		});
		expect(invoiceTotals([{ amount: 49_595 }, { amount: 12_500 }], 21)).toEqual({
			subtotal: 62_095,
			vat: 13_040,
			total: 75_135,
		});
		expect(invoiceTotals([], 21)).toEqual({ subtotal: 0, vat: 0, total: 0 });
	});

	test("rates show without trailing zeros, in the language's notation", () => {
		expect(formatRate(21)).toBe("21%");
		expect(formatRate(5.5)).toBe("5.5%");
		expect(formatRate(5.5, "nl")).toBe("5,5%");
	});
});

describe("status", () => {
	const due = new Date(2026, 9, 7);

	test("a sent invoice is overdue from the day after its due date", () => {
		const sent = { status: "sent" as const, dueOn: due };
		expect(isOverdue(sent, new Date(2026, 9, 7, 23, 59))).toBe(false);
		expect(isOverdue(sent, new Date(2026, 9, 8))).toBe(true);
		expect(invoiceState(sent, new Date(2026, 9, 8))).toBe("overdue");
		expect(invoiceState(sent, new Date(2026, 9, 1))).toBe("sent");
	});

	test.each(["draft", "paid", "void"] as const)("a %s invoice is never overdue", (status) => {
		expect(invoiceState({ status, dueOn: due }, new Date(2027, 0, 1))).toBe(status);
	});

	test("a draft is issued or voided; a sent invoice paid or voided; then it's final", () => {
		const allowed = invoiceStatuses.flatMap((from) =>
			invoiceStatuses.filter((to) => canChange(from, to)).map((to) => `${from} → ${to}`),
		);
		expect(allowed).toEqual(["draft → sent", "draft → void", "sent → paid", "sent → void"]);
	});

	test("only a draft can be edited", () => {
		expect(invoiceStatuses.filter(isEditable)).toEqual(["draft"]);
	});

	test("the due date is the payment term after the issue date, across months", () => {
		expect(dueDate(new Date(2026, 9, 7), 30)).toEqual(new Date(2026, 10, 6));
		expect(dueDate(new Date(2026, 11, 15), 30)).toEqual(new Date(2027, 0, 14));
		expect(dueDate(new Date(2026, 9, 7), 0)).toEqual(new Date(2026, 9, 7));
	});

	test("today is at midnight", () => {
		expect(today(new Date(2026, 9, 7, 15, 30))).toEqual(new Date(2026, 9, 7));
	});
});

describe("lines", () => {
	const order = { id: 7, number: "ORD-2026-00007", description: "Leak at main seal" };
	const detail = "Materials and labour";

	test("an order is its materials and labour, then each adjustment, adding up to its total", () => {
		const lines = orderLines(
			order,
			{
				materials: 12_000,
				labor: 8500,
				adjustments: [
					{
						label: "Covered by CTR-2026-0001 (Standard)",
						detail: "Labour included",
						amount: -8500,
					},
				],
				total: 12_000,
			},
			detail,
		);
		expect(lines).toEqual([
			{
				description: "ORD-2026-00007: Leak at main seal",
				detail: "Materials and labour",
				quantity: 1,
				unitPrice: 20_500,
				amount: 20_500,
				orderId: 7,
				source: null,
			},
			{
				description: "Covered by CTR-2026-0001 (Standard)",
				detail: "Labour included",
				quantity: 1,
				unitPrice: -8500,
				amount: -8500,
				orderId: 7,
				source: null,
			},
		]);
		expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBe(12_000);
	});

	test("without adjustments, an order is one line", () => {
		const lines = orderLines(
			order,
			{ materials: 100, labor: 200, adjustments: [], total: 300 },
			detail,
		);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({ amount: 300, detail: "Materials and labour" });
	});

	test("adjustments that take off more than the order costs stop at zero, like its total", () => {
		const lines = orderLines(
			order,
			{
				materials: 1000,
				labor: 2000,
				adjustments: [
					{ label: "Goodwill", amount: -1500 },
					{ label: "Covered", amount: -2500 },
				],
				total: 0,
			},
			detail,
		);
		expect(lines.map((line) => line.amount)).toEqual([3000, -1500, -1500]);
		expect(lines[2].unitPrice).toBe(-1500);
	});

	test("another module's item keeps its reference", () => {
		expect(
			itemLine({
				reference: "contracts:3:2026-10-01",
				description: "Service contract CTR-2026-0003 (Premium)",
				quantity: 1,
				unitPrice: 45_000,
			}),
		).toEqual({
			description: "Service contract CTR-2026-0003 (Premium)",
			detail: null,
			quantity: 1,
			unitPrice: 45_000,
			amount: 45_000,
			orderId: null,
			source: "contracts:3:2026-10-01",
		});
	});
});
