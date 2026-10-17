import type { RouteParams } from "$app/types";
import type { RequestHandler } from "@sveltejs/kit";

import { requireModule } from "#lib/server/auth/index.ts";
import { loadCreditNote } from "#modules/invoices/server/credit-notes.ts";
import { invoicePdf } from "#modules/invoices/server/invoice-pdf.ts";

/** The credit note as a PDF download; like its page, only for the tenant's own and with the module. */
export const GET: RequestHandler<
	RouteParams<"/(app)/(modules)/invoices/credit-notes/[number]/pdf">
> = async ({ params }) => {
	const tenant = requireModule("invoices");
	const { creditNote, totals } = await loadCreditNote(params.number);
	const pdf = await invoicePdf({
		...creditNote,
		organization: tenant.name,
		state: creditNote.status,
		dueOn: null,
		paidOn: null,
		paymentTermDays: 0,
		notes: null,
		totals,
		credit: {
			reason: creditNote.reason,
			invoice: creditNote.invoice?.number ?? null,
			settledOn: creditNote.settledOn,
		},
	});
	return new Response(pdf as Uint8Array<ArrayBuffer>, {
		headers: {
			"content-type": "application/pdf",
			"content-disposition": `attachment; filename="${creditNote.number}.pdf"`,
			"cache-control": "private, no-store",
		},
	});
};
