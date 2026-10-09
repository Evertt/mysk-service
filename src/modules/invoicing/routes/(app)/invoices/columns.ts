import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.ts";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import { formatCents } from "#lib/i18n";

import InvoiceLink from "../../../invoice-link.svelte";
import { invoiceStates } from "../../../invoice.ts";
import StatusBadge from "../../../status-badge.svelte";
import type { getInvoices } from "./invoices.remote.ts";

export type InvoiceRow = Awaited<ReturnType<typeof getInvoices>>[number];

const column = createAppColumnHelper<InvoiceRow>();

export const columns = column.columns([
	column.select(),
	column.accessor("number", {
		cell: ({ getValue }) => renderComponent(InvoiceLink, { number: getValue() }),
		enableHiding: false,
		meta: { label: m.invoices_column_invoice },
	}),
	column.accessor((row) => row.customer.name, {
		id: "customer",
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: row.original.customer.name,
				secondary: row.original.customer.code,
				href: resolve("/(app)/customers/[code]", { code: row.original.customer.code }),
			}),
		// By the customer's code, e.g. `?customer=CUST-0001`.
		filterFn: (row, _id, codes: string[]) => codes.includes(row.original.customer.code),
		enableGrouping: true,
		getGroupingValue: (row) => row.customer.code,
		meta: { label: m.invoices_column_customer, filter: "set" },
	}),
	// The status, with sent invoices past their due date as overdue.
	column.accessor("state", {
		id: "status",
		cell: ({ getValue }) => renderComponent(StatusBadge, { state: getValue() }),
		filterFn: "oneOf",
		enableGrouping: true,
		// In the order an invoice goes through them rather than alphabetically.
		sortFn: (a, b, id) =>
			invoiceStates.indexOf(a.getValue(id)) - invoiceStates.indexOf(b.getValue(id)),
		meta: { label: m.invoices_column_status, filterValues: invoiceStates },
	}),
	// Drafts have no dates yet; `undefined` sorts them last.
	column.accessor((row) => row.issuedOn ?? undefined, {
		id: "issuedOn",
		cell: ({ cell }) => renderComponent(cell.DateCell),
		sortUndefined: "last",
		enableGlobalFilter: false,
		meta: { label: m.invoices_column_issued, param: "issued" },
	}),
	column.accessor((row) => row.dueOn ?? undefined, {
		id: "dueOn",
		cell: ({ cell }) => renderComponent(cell.DateCell),
		sortUndefined: "last",
		enableGlobalFilter: false,
		meta: { label: m.invoices_column_due, param: "due" },
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
				href: resolve("/(app)/invoices/[number]", { number: row.original.number }),
				copy: [
					{ label: m.invoices_copy_number(), value: row.original.number },
					{ label: m.invoices_copy_customer_code(), value: row.original.customer.code },
				],
			}),
	}),
]);
