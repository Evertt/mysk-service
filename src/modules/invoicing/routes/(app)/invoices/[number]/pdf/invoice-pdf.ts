/**
 * An invoice as a PDF (A4), laid out like its page (`invoice-document.svelte`): who it's from and
 * for, its dates, lines and totals. Uses PDF's standard Helvetica, so nothing is embedded. Made
 * per request, in the request's language (the lines are as they were billed).
 */
import { type PDFFont, PDFDocument, type PDFPage, rgb, StandardFonts } from "pdf-lib";

import { formatCents, formatDate, formatNumber } from "#lib/i18n/format.ts";
import { m } from "#lib/paraglide/messages.js";

import { formatRate } from "../../../../../display.ts";
import type { InvoiceState } from "../../../../../invoice.ts";
import { invoicingLabels } from "../../../../../labels.ts";

export interface PdfInvoice {
	organization: string;
	number: string;
	state: InvoiceState;
	issuedOn: Date | null;
	dueOn: Date | null;
	paidOn: Date | null;
	paymentTermDays: number;
	vatRate: number;
	notes: string | null;
	customer: {
		code: string;
		name: string;
		contactName: string;
		email: string;
		city: string;
		country: string;
	};
	lines: {
		description: string;
		detail: string | null;
		quantity: number;
		unitPrice: number;
		amount: number;
	}[];
	totals: { subtotal: number; vat: number; total: number };
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const muted = rgb(0.42, 0.45, 0.5);
const black = rgb(0.1, 0.1, 0.12);
const rule = rgb(0.85, 0.86, 0.88);

/** Where the columns of the lines table end (right-aligned) or start (description). */
const columns = { quantity: 370, unitPrice: 455, amount: A4.width - MARGIN };

export async function invoicePdf(invoice: PdfInvoice): Promise<Uint8Array> {
	const pdf = await PDFDocument.create();
	pdf.setTitle(m.invoices_invoice_number({ number: invoice.number }));
	pdf.setAuthor(invoice.organization);
	pdf.setCreator("Fieldworks");
	const regular = await pdf.embedFont(StandardFonts.Helvetica);
	const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

	// The standard fonts only have Western European characters; others become their base letter,
	// or a question mark.
	const supported = new Set(regular.getCharacterSet());
	const fits = (char: string) => supported.has(char.codePointAt(0)!);
	const clean = (text: string) =>
		text.replace(/./gsu, (char) => {
			if (fits(char)) return char;
			const base = char.normalize("NFD").replace(/\p{M}/gu, "");
			return base && base.replace(/./gsu, (c) => (fits(c) ? "" : "?")) === "" ? base : "?";
		});

	let page: PDFPage = pdf.addPage([A4.width, A4.height]);
	let y = A4.height - MARGIN;

	const text = (
		value: string,
		x: number,
		options: { size?: number; font?: PDFFont; color?: typeof black; align?: "left" | "right" } = {},
	) => {
		const { size = 10, font = regular, color = black, align = "left" } = options;
		const content = clean(value);
		const width = font.widthOfTextAtSize(content, size);
		page.drawText(content, { x: align === "right" ? x - width : x, y, size, font, color });
	};

	/** Splits `value` into lines that fit `width`. */
	const wrap = (value: string, width: number, size: number, font = regular) => {
		const lines: string[] = [];
		let current = "";
		for (const word of clean(value).split(/\s+/)) {
			const next = current ? `${current} ${word}` : word;
			if (current && font.widthOfTextAtSize(next, size) > width) {
				lines.push(current);
				current = word;
			} else {
				current = next;
			}
		}
		if (current) lines.push(current);
		return lines;
	};

	const line = () => {
		page.drawLine({
			start: { x: MARGIN, y },
			end: { x: A4.width - MARGIN, y },
			thickness: 0.5,
			color: rule,
		});
	};

	const tableHeader = () => {
		text(m.invoices_description_column(), MARGIN, { size: 9, color: muted });
		text(m.invoices_quantity(), columns.quantity, { size: 9, color: muted, align: "right" });
		text(m.invoices_unit_price(), columns.unitPrice, { size: 9, color: muted, align: "right" });
		text(m.invoices_amount(), columns.amount, { size: 9, color: muted, align: "right" });
		y -= 8;
		line();
		y -= 16;
	};

	/** Starts a new page if less than `needed` points are left. */
	const ensure = (needed: number) => {
		if (y - needed >= MARGIN) return;
		page = pdf.addPage([A4.width, A4.height]);
		y = A4.height - MARGIN;
		const continued = m.invoices_pdf_continued({
			organization: invoice.organization,
			number: invoice.number,
		});
		text(continued, MARGIN, { size: 9, color: muted });
		y -= 28;
		tableHeader();
	};

	// --- Header ---------------------------------------------------------------------------------
	text(invoice.organization, MARGIN, { size: 18, font: bold });
	text(m.invoices_pdf_heading(), A4.width - MARGIN, { size: 18, font: bold, align: "right" });
	y -= 20;
	text(invoice.number, A4.width - MARGIN, { size: 11, align: "right" });
	// Its status, unless it's simply sent.
	const label =
		invoice.state === "sent"
			? ""
			: invoicingLabels.label("invoiceState", invoice.state).toUpperCase();
	if (label) {
		y -= 16;
		text(label, A4.width - MARGIN, { size: 11, font: bold, color: muted, align: "right" });
	}

	// --- Bill to and dates ----------------------------------------------------------------------
	y -= 36;
	const top = y;
	text(m.invoices_bill_to(), MARGIN, { size: 9, color: muted });
	y -= 15;
	const { customer } = invoice;
	for (const [value, font] of [
		[customer.name, bold],
		[m.invoices_attention({ name: customer.contactName }), regular],
		[`${customer.city}, ${customer.country}`, regular],
		[customer.email, regular],
		[m.invoices_customer_code({ code: customer.code }), regular],
	] as const) {
		text(value, MARGIN, { font });
		y -= 14;
	}
	const bottom = y;

	y = top;
	const dates: [string, string][] = [
		[
			m.invoices_column_issued(),
			invoice.issuedOn ? formatDate(invoice.issuedOn) : m.invoices_not_yet(),
		],
		[
			m.invoices_column_due(),
			invoice.dueOn
				? formatDate(invoice.dueOn)
				: m.invoices_due_after_issuing({ count: invoice.paymentTermDays }),
		],
		...(invoice.paidOn
			? [[m.invoices_paid(), formatDate(invoice.paidOn)] as [string, string]]
			: []),
	];
	for (const [name, value] of dates) {
		text(name, A4.width - MARGIN - 150, { size: 9, color: muted });
		text(value, A4.width - MARGIN, { align: "right" });
		y -= 15;
	}
	y = Math.min(y, bottom) - 24;

	// --- Lines ----------------------------------------------------------------------------------
	tableHeader();
	const descriptionWidth = columns.quantity - 60 - MARGIN;
	for (const item of invoice.lines) {
		const description = wrap(item.description, descriptionWidth, 10);
		const detail = item.detail ? wrap(item.detail, descriptionWidth, 8) : [];
		ensure(description.length * 13 + detail.length * 11 + 10);
		text(formatNumber(item.quantity), columns.quantity, { align: "right" });
		text(formatCents(item.unitPrice), columns.unitPrice, { align: "right" });
		text(formatCents(item.amount), columns.amount, { align: "right" });
		for (const part of description) {
			text(part, MARGIN);
			y -= 13;
		}
		for (const part of detail) {
			text(part, MARGIN, { size: 8, color: muted });
			y -= 11;
		}
		y -= 6;
	}
	if (!invoice.lines.length) {
		text(m.invoices_nothing_yet(), MARGIN, { color: muted });
		y -= 19;
	}

	// --- Totals ---------------------------------------------------------------------------------
	ensure(80);
	line();
	y -= 18;
	const totals: [string, number, PDFFont][] = [
		[m.invoices_subtotal(), invoice.totals.subtotal, regular],
		[m.invoices_vat({ rate: formatRate(invoice.vatRate) }), invoice.totals.vat, regular],
		[m.invoices_total(), invoice.totals.total, bold],
	];
	for (const [name, amount, font] of totals) {
		text(name, columns.unitPrice, { font, align: "right" });
		text(formatCents(amount), columns.amount, { font, align: "right" });
		y -= 16;
	}

	// --- Notes and payment ----------------------------------------------------------------------
	y -= 16;
	const closing = [
		...(invoice.notes ? invoice.notes.split("\n") : []),
		...(invoice.dueOn && invoice.state !== "void"
			? [
					m.invoices_please_pay({
						amount: formatCents(invoice.totals.total),
						date: formatDate(invoice.dueOn),
						number: invoice.number,
					}),
				]
			: []),
	];
	for (const paragraph of closing) {
		for (const part of wrap(paragraph, A4.width - 2 * MARGIN, 9)) {
			ensure(14);
			text(part, MARGIN, { size: 9, color: muted });
			y -= 13;
		}
	}

	return pdf.save();
}
