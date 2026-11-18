/**
 * A unit's documents (its manual, certificates, drawings, its declaration of performance or CE
 * declaration): which files the office may upload, how large, and how each one opens. The server
 * holds every file to these whatever the browser did (`storeUnitDocument()`).
 */
import type { EquipmentDocumentKind } from "#lib/models.ts";

/**
 * The most bytes a document may have: 25 MB, a scanned manual. Workers take 100 MB a request;
 * adapter-node takes only its `BODY_SIZE_LIMIT` (512 KB unless raised: see README.md).
 */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** The longest title a document may have. */
export const MAX_DOCUMENT_TITLE = 120;

/** The kinds of file the server keeps, each with the extension its key gets: as their bytes say. */
export const documentTypes = {
	"application/pdf": "pdf",
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
} as const;

export type DocumentType = keyof typeof documentTypes;

/** The file input's `accept`: the types and their extensions, for a picker that knows only one. */
export const documentAccept = [
	...Object.keys(documentTypes),
	".pdf",
	".jpg",
	".jpeg",
	".png",
	".webp",
	".docx",
	".xlsx",
].join(",");

/**
 * Whether a document of `type` opens in the browser (a PDF, an image) rather than being saved
 * (a Word or Excel file): its `Content-Disposition`.
 */
export const opensInline = (type: string) =>
	type === "application/pdf" || type.startsWith("image/");

/** A document's format, as a list shows it: `PDF`, `JPG`, `DOCX`. */
export const documentFormat = (type: string) =>
	(Object.hasOwn(documentTypes, type) ? documentTypes[type as DocumentType] : "").toUpperCase();

/** A unit's document as every shell lists it; `/documents/<id>` serves its file. */
export interface UnitDocument {
	id: number;
	title: string;
	kind: EquipmentDocumentKind;
	contentType: string;
	/** In bytes. */
	size: number;
	filename: string;
	createdAt: Temporal.Instant;
}
