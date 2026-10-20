/**
 * Changing a draft: its lines typed in (either kind's, `kind`), an invoice's orders, items and
 * terms, and a credit note's reason. The changes are in `../server/`.
 */
import * as v from "valibot";

import { id } from "#lib/schema.ts";

import { documentKinds } from "../document.ts";
import { reasonFields } from "../form/credit-note-schema.ts";
import { billingFields, lineFields, termsFields } from "../form/invoice-schema.ts";
import { form } from "../remote-functions.ts";
import { updateReason } from "../server/credit-notes.ts";
import { addDraftLine, removeDraftLine } from "../server/documents.ts";
import { refreshCreditNote, refreshDocument, refreshInvoice } from "../server/invoice-refresh.ts";
import { addToDraft, updateTerms as changeTerms } from "../server/invoices.ts";

const kind = v.picklist(documentKinds);

/** Adds a line typed in to a draft (`addDraftLine()`). */
export const addLine = form(v.object({ kind, id: id(), ...lineFields }), async (input) => {
	const { kind, id, ...line } = input;
	refreshDocument(kind, await addDraftLine(kind, id, line));
});

/** Removes a line from a draft; an invoice's order's lines go together (`removeDraftLine()`). */
export const removeLine = form(v.object({ kind, id: id() }), async ({ kind, id }) => {
	refreshDocument(kind, await removeDraftLine(kind, id));
});

/** Adds more of the customer's orders and items to a draft invoice. */
export const addToInvoice = form(v.object({ id: id(), ...billingFields }), async (input) => {
	refreshInvoice(await addToDraft(input));
});

/** Changes a draft invoice's payment term and notes. */
export const updateTerms = form(v.object({ id: id(), ...termsFields }), async (input) => {
	refreshInvoice(await changeTerms(input));
});

/** Changes a draft credit note's reason, unless another module made it. */
export const updateCreditReason = form(v.object({ id: id(), ...reasonFields }), async (input) => {
	refreshCreditNote(await updateReason(input));
});
