import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.js";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import InvoiceLink from "#lib/components/invoicing/invoice-link.svelte";
import { invoiceStates } from "#lib/components/invoicing/invoice.js";
import StatusBadge from "#lib/components/invoicing/status-badge.svelte";
import { m } from "#lib/paraglide/messages.js";

import type { getInvoices } from "./invoices.remote.js";

export type InvoiceRow = Awaited<ReturnType<typeof getInvoices>>[number];

const column = createAppColumnHelper<InvoiceRow>();

export const columns = column.columns([
	column.display({
		id: "select",
		header: ({ header }) => renderComponent(header.SelectAllHeader),
		cell: ({ cell }) => renderComponent(cell.SelectCell),
		enableSorting: false,
		enableHiding: false,
	}),
	column.accessor("number", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => renderComponent(InvoiceLink, { number: getValue() }),
		enableHiding: false,
		meta: { label: m.invoices_column_invoice },
	}),
	column.accessor((row) => row.customer.name, {
		id: "customer",
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: row.original.customer.name,
				secondary: row.original.customer.code,
				href: resolve("/(app)/customers/[code]", { code: row.original.customer.code }),
			}),
		meta: { label: m.invoices_column_customer },
	}),
	// The status, with sent invoices past their due date as overdue.
	column.accessor("state", {
		id: "status",
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => renderComponent(StatusBadge, { state: getValue() }),
		filterFn: "oneOf",
		// In the order an invoice goes through them rather than alphabetically.
		sortFn: (a, b, id) =>
			invoiceStates.indexOf(a.getValue(id)) - invoiceStates.indexOf(b.getValue(id)),
		meta: { label: m.invoices_column_status },
	}),
	// Drafts have no dates yet; `undefined` sorts them last.
	column.accessor((row) => row.issuedOn ?? undefined, {
		id: "issuedOn",
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.DateCell),
		sortUndefined: "last",
		enableGlobalFilter: false,
		meta: { label: m.invoices_column_issued },
	}),
	column.accessor((row) => row.dueOn ?? undefined, {
		id: "dueOn",
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.DateCell),
		sortUndefined: "last",
		enableGlobalFilter: false,
		meta: { label: m.invoices_column_due },
	}),
	column.accessor("total", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		meta: { label: m.invoices_column_total, align: "end" },
	}),
	column.accessor("createdAt", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: m.invoices_column_created },
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
