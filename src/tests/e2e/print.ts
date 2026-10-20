/**
 * What a page prints on: the size of its first sheet, in whole millimetres, as Chromium lays it out
 * for the page's own `@page` size. Chromium's default is Letter (216 × 279), so A4 (210 × 297)
 * shows that the page's named `@page` applied.
 */
import { PDFDocument } from "pdf-lib";
import type { Page } from "playwright";

const pointsPerMm = 72 / 25.4;

export async function printedSheet(page: Page) {
	const pdf = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true }));
	const { width, height } = pdf.getPage(0).getSize();
	return { width: Math.round(width / pointsPerMm), height: Math.round(height / pointsPerMm) };
}
