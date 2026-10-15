import * as v from "valibot";
import { expect, test } from "vite-plus/test";

import {
	lineFields,
	newInvoiceFields,
	settingsFields,
	termsFields,
} from "#modules/invoices/form/invoice-schema.ts";
import { day } from "#unit/temporal-support.ts";

const parse = <T extends v.ObjectEntries>(fields: T, input: unknown) =>
	v.safeParse(v.object(fields), input);
const messages = (result: { issues?: { message: string }[] }) =>
	result.issues?.map((issue) => issue.message);

test("a new invoice needs a customer; nothing checked is no orders or items", () => {
	const result = parse(newInvoiceFields, { customerId: "12" });
	expect(result.output).toEqual({ customerId: 12, orderIds: [], items: [] });
	expect(messages(parse(newInvoiceFields, { customerId: "" }))).toEqual(["Choose a customer"]);
});

test("checked orders arrive as ids, items as their references", () => {
	const result = parse(newInvoiceFields, {
		customerId: "3",
		orderIds: ["7", "9"],
		items: ["contracts:1:2026-10-01"],
	});
	expect(result.output).toEqual({
		customerId: 3,
		orderIds: [7, 9],
		items: ["contracts:1:2026-10-01"],
	});
	expect(parse(newInvoiceFields, { customerId: "3", orderIds: ["x"] }).success).toBe(false);
});

test("a typed-in line needs a description, a positive quantity and a price in euros", () => {
	expect(
		parse(lineFields, { description: " Travel ", quantity: 2, unitPrice: 12.5 }).output,
	).toEqual({ description: "Travel", quantity: 2, unitPrice: 1250 });
	expect(
		messages(parse(lineFields, { description: "", quantity: 0, unitPrice: undefined })),
	).toEqual(["Describe what's billed", "More than 0", "Enter a unit price"]);
});

test("a payment term is whole days, up to a year", () => {
	expect(parse(termsFields, { paymentTermDays: 14, notes: " " }).output).toEqual({
		paymentTermDays: 14,
		notes: null,
	});
	expect(messages(parse(termsFields, { paymentTermDays: 1.5, notes: "" }))).toEqual([
		"Whole days only",
	]);
	expect(messages(parse(termsFields, { paymentTermDays: 400, notes: "" }))).toEqual([
		"At most 365 days",
	]);
});

test("the VAT rate is a percentage", () => {
	const valid = { vatRate: 9, paymentTermDays: 30, billFrom: "2026-01-01" };
	expect(parse(settingsFields, valid).output).toEqual({
		vatRate: 9,
		paymentTermDays: 30,
		billFrom: day("2026-01-01"),
	});
	expect(messages(parse(settingsFields, { ...valid, vatRate: 120 }))).toEqual(["At most 100%"]);
	expect(messages(parse(settingsFields, { ...valid, vatRate: -1 }))).toEqual(["Can't be negative"]);
});
