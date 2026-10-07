import { loadInvoice } from "#lib/server/invoicing.js";
import { requireModule } from "#lib/server/session.js";

import type { RequestHandler } from "./$types";
import { invoicePdf } from "./invoice-pdf.js";

/** The invoice as a PDF download; like its page, only for the tenant's own and with the module. */
export const GET: RequestHandler = async ({ params }) => {
	const tenant = requireModule("invoicing");
	const { invoice, totals } = await loadInvoice(params.number);
	const pdf = await invoicePdf({ ...invoice, organization: tenant.name, totals });
	return new Response(pdf as Uint8Array<ArrayBuffer>, {
		headers: {
			"content-type": "application/pdf",
			"content-disposition": `attachment; filename="${invoice.number}.pdf"`,
			"cache-control": "private, no-store",
		},
	});
};
