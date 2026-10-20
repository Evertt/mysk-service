/**
 * A billing document as a PDF (A4), laid out like its page from the same `documentView()`
 * (`../document.ts`): who it's from and for, its dates, lines and totals. Uses PDF's standard
 * Helvetica, so nothing is embedded. Made per request, in the request's language (the lines are
 * as they were billed). A credit note is headed "Credit note" ("Creditnota").
 */
import { type PDFFont, PDFDocument, type PDFPage, rgb, StandardFonts } from "pdf-lib";

import { formatCents, formatNumber } from "#lib/i18n/index.ts";

import { type BillingDocument, documentView } from "../document.ts";
import { invoicesLabels } from "../labels.ts";

/** What heads each kind, and its next pages. */
const headings = {
	invoice: { heading: m.invoices_pdf_heading, continued: m.invoices_pdf_continued },
	creditNote: {
		heading: m.invoices_pdf_credit_heading,
		continued: m.invoices_pdf_credit_continued,
	},
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const muted = rgb(0.42, 0.45, 0.5);
const black = rgb(0.1, 0.1, 0.12);
const rule = rgb(0.85, 0.86, 0.88);

/** Where the columns of the lines table end (right-aligned) or start (description). */
const columns = { quantity: 370, unitPrice: 455, amount: A4.width - MARGIN };

export async function documentPdf(doc: BillingDocument): Promise<Uint8Array> {
	const view = documentView(doc);
	const pdf = await PDFDocument.create();
	pdf.setTitle(view.title);
	pdf.setAuthor(doc.organization);
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
		const of = { organization: doc.organization, number: doc.number };
		text(headings[doc.kind].continued(of), MARGIN, { size: 9, color: muted });
		y -= 28;
		tableHeader();
	};

	// --- Header ---------------------------------------------------------------------------------
	text(doc.organization, MARGIN, { size: 18, font: bold });
	text(headings[doc.kind].heading(), A4.width - MARGIN, { size: 18, font: bold, align: "right" });
	y -= 20;
	text(doc.number, A4.width - MARGIN, { size: 11, align: "right" });
	// Its status, unless it's simply sent.
	const state = doc.kind === "invoice" ? doc.state : doc.status;
	if (state !== "sent") {
		const label =
			doc.kind === "invoice"
				? invoicesLabels.label("invoiceState", doc.state)
				: invoicesLabels.label("creditNoteState", doc.status);
		y -= 16;
		text(label.toUpperCase(), A4.width - MARGIN, {
			size: 11,
			font: bold,
			color: muted,
			align: "right",
		});
	}

	// --- Bill to and dates ----------------------------------------------------------------------
	y -= 36;
	const top = y;
	text(m.invoices_bill_to(), MARGIN, { size: 9, color: muted });
	y -= 15;
	const { customer } = doc;
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
	for (const { label, value } of view.dates) {
		text(label, A4.width - MARGIN - 150, { size: 9, color: muted });
		text(value, A4.width - MARGIN, { align: "right" });
		y -= 15;
	}
	y = Math.min(y, bottom) - 24;
	if (view.reason) {
		text(view.reason, MARGIN);
		y -= 28;
	}

	// --- Lines ----------------------------------------------------------------------------------
	tableHeader();
	const descriptionWidth = columns.quantity - 60 - MARGIN;
	for (const item of doc.lines) {
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
	if (!doc.lines.length) {
		text(m.invoices_nothing_yet(), MARGIN, { color: muted });
		y -= 19;
	}

	// --- Totals ---------------------------------------------------------------------------------
	ensure(80);
	line();
	y -= 18;
	for (const { label, value, total } of view.totals) {
		const font = total ? bold : regular;
		text(label, columns.unitPrice, { font, align: "right" });
		text(formatCents(value), columns.amount, { font, align: "right" });
		y -= 16;
	}

	// --- Closing --------------------------------------------------------------------------------
	y -= 16;
	for (const paragraph of view.closing.flatMap((each) => each.split("\n"))) {
		for (const part of wrap(paragraph, A4.width - 2 * MARGIN, 9)) {
			ensure(14);
			text(part, MARGIN, { size: 9, color: muted });
			y -= 13;
		}
	}

	return pdf.save();
}

/** The document's PDF as a download, named after its number. */
export async function pdfResponse(doc: BillingDocument) {
	const pdf = await documentPdf(doc);
	return new Response(pdf as Uint8Array<ArrayBuffer>, {
		headers: {
			"content-type": "application/pdf",
			"content-disposition": `attachment; filename="${doc.number}.pdf"`,
			"cache-control": "private, no-store",
		},
	});
}
