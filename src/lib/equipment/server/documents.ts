/**
 * A unit's documents (`equipment_document`): its manual, certificates, drawings, its declaration of
 * performance or CE declaration. The office uploads, renames and deletes them; whoever may read the
 * unit reads them (the access registry's `equipment_document`, a part of `equipment`: the office,
 * every engineer, the customer's contacts who see the unit's site), at `/documents/<id>`
 * (`serveUnitDocument()`), never at a public URL. Each change is logged on the unit.
 *
 * The files follow the records' files' one way (`#lib/server/files/stored.ts`): stored before the
 * transaction that records them (`addUnitDocument()`), deleted after the one that deletes them
 * (`removeUnitDocument()`, and a unit's with it: `documentFilesOf()`), swept daily
 * (`sweepUnitDocuments()`), under the documents' own prefix in the store (`documentPrefix()`), which
 * the photos' sweep never lists.
 */
import { and, asc, eq } from "drizzle-orm";

import { equipmentSubject } from "#lib/activity/index.ts";
import { numberFormatter } from "#lib/i18n/format.ts";
import type { EquipmentDocumentKind } from "#lib/models.ts";
import { changeOrNotFound, visible, visibleOrNone } from "#lib/server/access/index.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { equipment, equipmentDocument } from "#lib/server/db/schema.ts";
import { documentKey, documentPrefix } from "#lib/server/files/keys.ts";
import { documentStore } from "#lib/server/files/photos.ts";
import {
	discardFiles,
	type FileToStore,
	serveStoredFile,
	sweepFiles,
	withStoredFiles,
} from "#lib/server/files/stored.ts";
import { sniffType } from "#lib/server/files/types.ts";
import { deleteAndLog, orNotFound } from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";

import {
	type DocumentType,
	documentTypes,
	MAX_DOCUMENT_BYTES,
	opensInline,
	type UnitDocument,
} from "../documents/documents.ts";

const megabytes = numberFormatter({ style: "unit", unit: "megabyte", maximumFractionDigits: 0 });

/** A refusal on the form's `file` field. */
const onFile = (message: string) => new Refused({ path: ["file"], message });

const types = Object.keys(documentTypes) as DocumentType[];

/** The longest file name kept, its end (with the extension) if it's longer. */
const MAX_FILENAME = 200;

/**
 * Checks `file` against the limits (a PDF, a JPEG, PNG or WebP image, a Word or Excel file, as its
 * bytes say, of at most `MAX_DOCUMENT_BYTES`), and answers it to store under a new key of the
 * tenant's; a `Refused` on `file` if it isn't one. Before anything is stored.
 */
async function readDocument(file: File): Promise<FileToStore> {
	if (!file.size) throw onFile(m.equipment_documents_file_required());
	if (file.size > MAX_DOCUMENT_BYTES) {
		throw onFile(
			m.equipment_documents_file_too_large({ size: megabytes(MAX_DOCUMENT_BYTES / 2 ** 20) }),
		);
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	const type = sniffType(bytes, types);
	if (!type) throw onFile(m.equipment_documents_file_unknown());
	const { organizationId } = currentTenant();
	return {
		objectKey: documentKey(organizationId, documentTypes[type]),
		bytes,
		contentType: type,
	};
}

/** The unit `id` of the tenant, in `runner`, by its id and serial number; a 404 if there's none. */
async function unitOf(runner: Transaction, id: number) {
	const [found] = await runner
		.select({ id: equipment.id, serialNumber: equipment.serialNumber })
		.from(equipment)
		.where(idInTenant(equipment, id));
	return orNotFound(found, m.equipment_not_found());
}

/** What the office says of a document: its title and kind. */
interface DocumentFields {
	title: string;
	kind: EquipmentDocumentKind;
}

/**
 * Adds `file` to the unit `unitId` as a document (`fields`), for whoever may change the unit (the
 * office; a 404 for anyone else, also by a tampered id): checked (`readDocument()`), stored, then
 * recorded and logged as created on the unit, by the signed-in user. Answers the unit's serial
 * number.
 */
export async function addUnitDocument(unitId: number, fields: DocumentFields, file: File) {
	await changeOrNotFound({ type: "equipment", id: unitId });
	const toStore = await readDocument(file);
	// The name the browser gave it (never a path), else the title's.
	const filename =
		file.name.trim().slice(-MAX_FILENAME) ||
		`${fields.title}.${documentTypes[toStore.contentType as DocumentType]}`;
	return withStoredFiles(documentStore(), [toStore], ([stored]) =>
		db.transaction(async (tx) => {
			const unit = await unitOf(tx, unitId);
			const { organizationId, user } = currentTenant();
			const [added] = await tx
				.insert(equipmentDocument)
				.values({
					...fields,
					...stored,
					organizationId,
					equipmentId: unit.id,
					filename,
					userId: user.id,
				})
				.returning({ id: equipmentDocument.id });
			await recordActivity(tx, {
				action: "created",
				subject: { type: "equipment_document", id: added.id, label: fields.title },
				parent: equipmentSubject(unit),
			});
			return unit.serialNumber;
		}),
	);
}

/** The document `id` the viewer may change (the office), in `tx`; a 404 for anyone else's. */
async function documentToChange(tx: Transaction, id: number) {
	const theirs = orNotFound(
		await visible("equipment_document", "change"),
		m.equipment_documents_not_found(),
	);
	const [found] = await tx
		.select({
			id: equipmentDocument.id,
			equipmentId: equipmentDocument.equipmentId,
			title: equipmentDocument.title,
			kind: equipmentDocument.kind,
			objectKey: equipmentDocument.objectKey,
		})
		.from(equipmentDocument)
		.where(and(idInTenant(equipmentDocument, id), theirs));
	return orNotFound(found, m.equipment_documents_not_found());
}

/**
 * Renames the document `id` (its title and kind), for whoever may change it (the office; a 404 for
 * anyone else, also by a tampered id), logged as updated on its unit when something changed.
 */
export async function updateUnitDocument(id: number, fields: DocumentFields) {
	await db.transaction(async (tx) => {
		const found = await documentToChange(tx, id);
		await tx.update(equipmentDocument).set(fields).where(idInTenant(equipmentDocument, found.id));
		await recordActivity(tx, {
			action: "updated",
			subject: { type: "equipment_document", id: found.id, label: fields.title },
			parent: equipmentSubject(await unitOf(tx, found.equipmentId)),
			before: { title: found.title, kind: found.kind },
			after: fields,
		});
	});
}

/**
 * Deletes the document `id`, for whoever may change it (the office; a 404 for anyone else, also by
 * a tampered id), logged as deleted on its unit; then its file, once that has committed.
 */
export async function removeUnitDocument(id: number) {
	const objectKey = await db.transaction(async (tx) => {
		const found = await documentToChange(tx, id);
		await deleteAndLog(equipmentDocument, {
			tx,
			subject: { type: "equipment_document", id: found.id, label: found.title },
			parent: equipmentSubject(await unitOf(tx, found.equipmentId)),
		});
		return found.objectKey;
	});
	await discardFiles(documentStore(), [objectKey]);
}

/**
 * What lets go of the files of the unit `unitId`'s documents, in `tx`: the transaction that deletes
 * the unit (their rows go with it) asks for it, and runs it once it has committed
 * (`defineRemoval()`'s `afterwards`).
 */
export async function documentFilesOf(tx: Transaction, unitId: number) {
	const found = await tx
		.select({ objectKey: equipmentDocument.objectKey })
		.from(equipmentDocument)
		.where(and(eq(equipmentDocument.equipmentId, unitId), inTenant(equipmentDocument)));
	const keys = found.map((row) => row.objectKey);
	return () => discardFiles(documentStore(), keys);
}

/** The documents of the unit `unitId` that the viewer may read, by title (the pages group them by kind). */
export async function unitDocuments(unitId: number): Promise<UnitDocument[]> {
	return db
		.select({
			id: equipmentDocument.id,
			title: equipmentDocument.title,
			kind: equipmentDocument.kind,
			contentType: equipmentDocument.contentType,
			size: equipmentDocument.size,
			filename: equipmentDocument.filename,
			createdAt: equipmentDocument.createdAt,
		})
		.from(equipmentDocument)
		.where(
			and(eq(equipmentDocument.equipmentId, unitId), await visibleOrNone("equipment_document")),
		)
		.orderBy(asc(equipmentDocument.title), asc(equipmentDocument.id));
}

/**
 * Deletes the tenant's stored document files (in `store`, the request's by default) that no
 * `equipment_document` row points to and that were stored more than a day before `now`
 * (`sweepFiles()`). For the daily run (`runDaily()`), as the system. Answers how many it deleted.
 */
export const sweepUnitDocuments = (now = Temporal.Now.instant(), store = documentStore()) =>
	sweepFiles(
		{
			store,
			prefix: documentPrefix,
			referenced: async (keys) =>
				(
					await db
						.select({ objectKey: equipmentDocument.objectKey })
						.from(equipmentDocument)
						.where(and(inList(equipmentDocument.objectKey, keys), inTenant(equipmentDocument)))
				).map((row) => row.objectKey),
		},
		now,
	);

/**
 * The document `id`'s file, for a signed-in member who may read its unit (the office, an engineer,
 * the customer's contact who sees it; a 401 signed out); a 404 for anyone else, also another
 * tenant's. A PDF or an image opens in the browser, another file is saved, by the name it was
 * uploaded with (`serveStoredFile()`).
 */
export const serveUnitDocument = (id: string): Promise<Response> =>
	serveStoredFile(
		{ type: "equipment_document", id },
		async (documentId) => {
			const [found] = await db
				.select({
					objectKey: equipmentDocument.objectKey,
					contentType: equipmentDocument.contentType,
					filename: equipmentDocument.filename,
				})
				.from(equipmentDocument)
				.where(idInTenant(equipmentDocument, documentId));
			return (
				found && {
					...found,
					disposition: { filename: found.filename, inline: opensInline(found.contentType) },
				}
			);
		},
		documentStore(),
	);
