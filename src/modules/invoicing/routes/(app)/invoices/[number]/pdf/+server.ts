import type { RouteParams } from "$app/types";
import type { RequestHandler } from "@sveltejs/kit";

import { requireModule } from "#lib/server/auth/index.ts";
import { invoicePdf } from "#modules/invoicing/server/invoice-pdf.ts";
import { loadInvoice } from "#modules/invoicing/server/invoices.ts";

/** The invoice as a PDF download; like its page, only for the tenant's own and with the module. */
export const GET: RequestHandler<RouteParams<"/(app)/(modules)/invoices/[number]/pdf">> = async ({
	params,
}) => {
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
