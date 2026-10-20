import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.ts";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import { CustomerLink } from "#lib/customers/components.ts";
import { formatCents } from "#lib/i18n/index.ts";

import { creditNoteStates, creditSettlements } from "../credit-note.ts";
import type { getCreditNotes } from "../credit-notes.remote.ts";
import { creditNoteStateDisplay } from "../display.ts";
import { invoicingLabels } from "../labels.ts";
import CreditNoteLink from "../ui/credit-note-link.svelte";

export type CreditNoteRow = Awaited<ReturnType<typeof getCreditNotes>>[number];

const column = createAppColumnHelper<CreditNoteRow>();

export const creditNoteColumns = column.columns([
	column.accessor("number", {
		cell: ({ getValue }) => renderComponent(CreditNoteLink, { number: getValue() }),
		enableHiding: false,
		meta: { label: m.invoices_credit_column_credit_note },
	}),
	column.accessor((row) => row.customer.name, {
		id: "customer",
		cell: ({ row }) =>
			renderComponent(CustomerLink, {
				code: row.original.customer.code,
				name: row.original.customer.name,
				withCode: true,
			}),
		// By the customer's code, e.g. `?customer=CUST-0001`.
		filterFn: (row, _id, codes: string[]) => codes.includes(row.original.customer.code),
		enableGrouping: true,
		getGroupingValue: (row) => row.customer.code,
		meta: { label: m.invoices_column_customer, filter: "set" },
	}),
	// The invoice it credits, or none for a standalone one.
	column.accessor((row) => row.invoice ?? "", {
		id: "invoice",
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: row.original.invoice,
				href: row.original.invoice
					? resolve("/(app)/(modules)/invoices/[number]", { number: row.original.invoice })
					: undefined,
				fallback: m.invoices_credit_standalone(),
			}),
		meta: { label: m.invoices_column_invoice },
	}),
	column.accessor("reason", {
		meta: { label: m.invoices_credit_column_reason },
	}),
	column.enum("status", {
		values: creditNoteStates,
		display: creditNoteStateDisplay,
		sortByOrder: true,
		meta: { label: m.invoices_column_status },
	}),
	// How a sent one is still to be settled: refunded, or offset against its (sent) invoice. Hidden
	// unless asked for; the dashboard links to the ones to refund (`?settlement=refund`).
	column.enum("settlement", {
		values: creditSettlements,
		label: (settlement) => invoicingLabels.label("creditSettlement", settlement),
		enableGrouping: false,
		enableGlobalFilter: false,
		meta: { label: m.invoices_credit_column_settlement },
	}),
	// Drafts have no dates yet; `undefined` sorts them last.
	column.accessor((row) => row.issuedOn ?? undefined, {
		id: "issuedOn",
		cell: ({ cell }) => renderComponent(cell.DateCell),
		sortUndefined: "last",
		enableGlobalFilter: false,
		meta: { label: m.invoices_column_issued, param: "issued" },
	}),
	column.accessor("total", {
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		meta: { label: m.invoices_column_total, align: "end", groupSum: (sum) => formatCents(sum) },
	}),
	column.accessor("createdAt", {
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: m.invoices_column_created, param: "created" },
	}),
	column.display({
		id: "actions",
		cell: ({ row }) =>
			renderComponent(RowActions, {
				label: row.original.number,
				href: resolve("/(app)/(modules)/invoices/credit-notes/[number]", {
					number: row.original.number,
				}),
				copy: [{ label: m.invoices_credit_copy_number(), value: row.original.number }],
			}),
	}),
]);
