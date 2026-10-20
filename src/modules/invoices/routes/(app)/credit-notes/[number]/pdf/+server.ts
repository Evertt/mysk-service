import type { RouteParams } from "$app/types";
import type { RequestHandler } from "@sveltejs/kit";

import { currentTenant } from "#lib/server/auth/index.ts";
import { loadCreditNote } from "#modules/invoices/server/credit-notes.ts";
import { pdfResponse } from "#modules/invoices/server/document-pdf.ts";

/** The credit note as a PDF download; like its page, only for the tenant's own. */
export const GET: RequestHandler<
	RouteParams<"/(app)/(modules)/invoices/credit-notes/[number]/pdf">
> = async ({ params }) => {
	const { creditNote, totals } = await loadCreditNote(params.number);
	return pdfResponse({
		...creditNote,
		kind: "creditNote",
		organization: currentTenant().name,
		totals,
	});
};
