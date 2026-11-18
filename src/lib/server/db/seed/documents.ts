/**
 * SHLTR's units' demo documents (`equipment_document`): a manual and a CE declaration on its
 * Sectionaaldeur D-07 (the Apparatuur page's "Sectionaaldeur laaddok 07"), a manual on dock 08's
 * door, an inspection certificate and a drawing on Connect's units. Their files are small PDFs made
 * here, of one page that says what they are, put in the local file store (`PHOTOS_DIR`, `.photos` by
 * default) under keys that are the same each time the seed runs, so seeding again overwrites them.
 * On Cloudflare the store is an R2 bucket the seed doesn't reach: there the documents are listed,
 * and their files are a 404 until they're uploaded again.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { EquipmentDocumentKind } from "#lib/models.ts";
import { documentKey } from "#lib/server/files/keys.ts";

/** A demo document: on the unit named `unit`, its title, kind and file name, and its PDF's lines. */
interface DemoDocument {
	unit: string;
	title: string;
	kind: EquipmentDocumentKind;
	filename: string;
	lines: string[];
}

const demoDocuments: DemoDocument[] = [
	{
		unit: "Sectionaaldeur laaddok 07",
		title: "Gebruikershandleiding Crawford SD 4000",
		kind: "manual",
		filename: "Crawford-SD4000-gebruikershandleiding.pdf",
		lines: [
			"Crawford SD 4000 sectionaaldeur",
			"Gebruikershandleiding",
			"1. Bediening: open en sluit de deur met de drukknoppen naast de deur.",
			"2. Noodbediening: ontkoppel de aandrijving met de rode trekkoord.",
			"3. Onderhoud: laat de deur elk half jaar keuren door een monteur.",
		],
	},
	{
		unit: "Sectionaaldeur laaddok 07",
		title: "Prestatieverklaring en CE-verklaring SD 4000",
		kind: "declaration",
		filename: "SD4000-prestatieverklaring-CE.pdf",
		lines: [
			"Prestatieverklaring volgens EN 13241",
			"Product: Crawford SD 4000 industriële sectionaaldeur",
			"Windbelasting: klasse 3. Waterdichtheid: klasse 2.",
			"De fabrikant verklaart dat het product voldoet aan de CE-eisen.",
		],
	},
	{
		unit: "Sectionaaldeur laaddok 08",
		title: "Gebruikershandleiding Crawford SD 4000",
		kind: "manual",
		filename: "Crawford-SD4000-gebruikershandleiding.pdf",
		lines: [
			"Crawford SD 4000 sectionaaldeur",
			"Gebruikershandleiding",
			"Zie hoofdstuk 3 voor het onderhoud van de veren en kabels.",
		],
	},
	{
		unit: "Sectionaaldeur D-11",
		title: "Keuringscertificaat 2026",
		kind: "certificate",
		filename: "Keuringscertificaat-D-11-2026.pdf",
		lines: [
			"Keuringscertificaat",
			"Hörmann SPU F42 sectionaaldeur, Werkplaats",
			"Gekeurd en goedgekeurd volgens EN 12604 en EN 12453.",
		],
	},
	{
		unit: "Leveller L-03",
		title: "Maatschets dock 03",
		kind: "drawing",
		filename: "Maatschets-dock-03.pdf",
		lines: ["Maatschets dock 03", "Crawford DL 6080 dockleveller, 2000 x 3000 mm"],
	},
];

/** `text` in a PDF string: its brackets and backslashes escaped. */
const pdfText = (text: string) => text.replace(/[()\\]/g, (char) => `\\${char}`);

/**
 * A PDF of one A4 page with `lines` on it, the first as its heading, in Helvetica (WinAnsi, so
 * Dutch letters show): small, and valid enough for every browser's viewer.
 */
export function demoPdf(lines: readonly string[]): Uint8Array {
	const content = [
		"BT",
		"/F1 20 Tf 56 770 Td",
		`(${pdfText(lines[0])}) Tj`,
		"/F1 12 Tf",
		...lines.slice(1).map((line) => `0 -28 Td (${pdfText(line)}) Tj`),
		"ET",
	].join("\n");
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
		`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
	];
	let pdf = "%PDF-1.4\n";
	const offsets: number[] = [];
	objects.forEach((object, i) => {
		offsets.push(Buffer.byteLength(pdf, "latin1"));
		pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
	});
	const xref = Buffer.byteLength(pdf, "latin1");
	pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return new Uint8Array(Buffer.from(pdf, "latin1"));
}

/** A seeded document's file: its key in the store and its bytes. */
interface DemoFile {
	objectKey: string;
	bytes: Uint8Array;
}

/**
 * The tenant `organizationId`'s demo documents, on its units by name (`unitIds`), as rows to insert
 * and the files to put in the store once the seed's transaction has committed (`storeDemoFiles()`).
 */
export function generateDemoDocuments(
	organizationId: string,
	unitIds: ReadonlyMap<string, number>,
) {
	const rows = [];
	const files: DemoFile[] = [];
	for (const [i, document] of demoDocuments.entries()) {
		const equipmentId = unitIds.get(document.unit);
		if (equipmentId === undefined) continue;
		const bytes = demoPdf(document.lines);
		const objectKey = documentKey(organizationId, "pdf", `seed-${i + 1}`);
		rows.push({
			organizationId,
			equipmentId,
			title: document.title,
			kind: document.kind,
			objectKey,
			contentType: "application/pdf",
			size: bytes.byteLength,
			filename: document.filename,
		});
		files.push({ objectKey, bytes });
	}
	return { rows, files };
}

/** Puts the demo documents' `files` in the local file store (`PHOTOS_DIR`, else `.photos`). */
export async function storeDemoFiles(files: readonly DemoFile[]) {
	const folder = resolve(process.env.PHOTOS_DIR || ".photos");
	for (const { objectKey, bytes } of files) {
		const path = join(folder, objectKey);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, bytes);
	}
}
