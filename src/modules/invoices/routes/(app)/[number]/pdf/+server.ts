import type { RouteParams } from "$app/types";
import type { RequestHandler } from "@sveltejs/kit";

import { currentTenant } from "#lib/server/auth/index.ts";
import { pdfResponse } from "#modules/invoices/server/document-pdf.ts";
import { loadInvoice } from "#modules/invoices/server/invoices.ts";

/** The invoice as a PDF download; like its page, only for the tenant's own. */
export const GET: RequestHandler<RouteParams<"/(app)/(modules)/invoices/[number]/pdf">> = async ({
	params,
}) => {
	const { invoice, totals } = await loadInvoice(params.number);
	return pdfResponse({ ...invoice, kind: "invoice", organization: currentTenant().name, totals });
};
