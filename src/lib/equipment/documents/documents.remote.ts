/**
 * A unit's documents (see `../server/documents.ts`): read in every shell that shows the unit (the
 * office's unit page, the engineer portal's, the customer portal's documents page), so any member
 * may ask (`forAnyRole`) and the access registry says which unit and documents they reach: the
 * office's, an engineer's, the customer's contact's at the sites they see. Anyone else's is a 404,
 * also by a tampered serial number. Adding, renaming and deleting them is the office's
 * (`forMembers`); none keeps a list of queries to refresh, so each refreshes the page it's sent
 * from.
 */
import { and } from "drizzle-orm";
import * as v from "valibot";

import { equipmentDocumentKinds } from "#lib/models.ts";
import { id, text, textMax } from "#lib/schema.ts";
import { visibleOrNone } from "#lib/server/access/index.ts";
import { db } from "#lib/server/db/index.ts";
import { equipment } from "#lib/server/db/schema.ts";
import { forAnyRole, forMembers } from "#lib/server/remote-functions.ts";

import {
	addUnitDocument,
	removeUnitDocument,
	unitDocuments,
	updateUnitDocument,
} from "../server/documents.ts";
import { unitBySerial } from "../server/lookup.ts";
import { MAX_DOCUMENT_TITLE } from "./documents.ts";

/**
 * The documents of the unit `serialNumber` that the viewer may read (a 404 if they may not read the
 * unit), by title, with the unit's id.
 */
export const getUnitDocuments = forAnyRole.query(v.string(), async (serialNumber) => {
	const seen = await visibleOrNone("equipment");
	const unit = await unitBySerial(serialNumber, (where) =>
		db.select({ id: equipment.id }).from(equipment).where(and(where, seen)),
	);
	return { unitId: unit.id, documents: await unitDocuments(unit.id) };
});

/** What the office says of a document. */
const fields = {
	title: v.pipe(text(m.equipment_documents_title_required), textMax(MAX_DOCUMENT_TITLE)),
	kind: v.picklist(equipmentDocumentKinds, m.equipment_documents_kind_required),
};

/**
 * Uploads a document (a PDF, an image, a Word or Excel file of at most `MAX_DOCUMENT_BYTES`) to the
 * unit `unitId`: a multipart form, so it works without JavaScript too.
 */
export const addDocument = forMembers.form(
	v.object({ unitId: id(), ...fields, file: v.file(m.equipment_documents_file_required) }),
	async ({ unitId, file, ...document }) => {
		await addUnitDocument(unitId, document, file);
	},
);

/** Renames the document `id`, and says what kind it is. */
export const editDocument = forMembers.form(v.object({ id: id(), ...fields }), async (input) => {
	const { id: documentId, ...document } = input;
	await updateUnitDocument(documentId, document);
});

/** Deletes the document `id`, and its file. */
export const deleteDocument = forMembers.form(
	v.object({ id: id() }),
	async ({ id: documentId }) => {
		await removeUnitDocument(documentId);
	},
);
